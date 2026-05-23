from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, renderer_classes
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.response import Response
from rest_framework.permissions import AllowAny


class SSERenderer(BaseRenderer):
    """Satisfies DRF content-negotiation for text/event-stream requests.

    The view returns StreamingHttpResponse directly so this renderer's
    render() is never actually called — it just makes DRF accept the
    Accept: text/event-stream header instead of returning 406.
    """
    media_type = 'text/event-stream'
    format = 'sse'

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.http import StreamingHttpResponse
import jwt
from datetime import datetime, timedelta, timezone
import json
import os
from openai import OpenAI

from .models import Song
from .serializers import SongSerializer

User = get_user_model()

AUTH_COOKIE_NAME = 'auth-token'
AUTH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days


def _issue_auth_cookie(response, user):
    token = jwt.encode(
        {
            'userId': user.id,
            'email': user.email,
            'name': getattr(user, 'name', '') or '',
            'exp': int((datetime.now(timezone.utc) + timedelta(seconds=AUTH_COOKIE_MAX_AGE)).timestamp()),
        },
        settings.JWT_SECRET,
        algorithm='HS256',
    )
    response.set_cookie(
        AUTH_COOKIE_NAME,
        token,
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        max_age=AUTH_COOKIE_MAX_AGE,
        path='/',
    )


def _user_from_request(request):
    token = request.COOKIES.get(AUTH_COOKIE_NAME)
    if not token:
        return None
    try:
        decoded = jwt.decode(token, settings.JWT_SECRET, algorithms=['HS256'])
        return User.objects.get(id=decoded['userId'])
    except (jwt.InvalidTokenError, User.DoesNotExist):
        return None


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """Health check endpoint"""
    return Response({
        'status': 'ok',
        'timestamp': datetime.now().isoformat(),
        'environment': os.environ.get('DJANGO_SETTINGS_MODULE', 'development'),
        'openaiConfigured': bool(os.environ.get('OPENAI_API_KEY')),
        'version': '1.0.0'
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def openai_chat(request):
    """OpenAI chat endpoint"""
    messages = request.data.get('messages')
    model = request.data.get('model', 'gpt-4o')
    max_tokens = request.data.get('max_tokens', 4000)
    temperature = request.data.get('temperature', 0.7)

    if not messages or not isinstance(messages, list):
        return Response(
            {'error': 'Invalid messages format'},
            status=status.HTTP_400_BAD_REQUEST
        )

    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        return Response(
            {'error': 'OpenAI API key not configured'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature
        )
        
        return Response({
            'id': response.id,
            'object': response.object,
            'created': response.created,
            'model': response.model,
            'choices': [{
                'index': choice.index,
                'message': {
                    'role': choice.message.role,
                    'content': choice.message.content
                },
                'finish_reason': choice.finish_reason
            } for choice in response.choices],
            'usage': {
                'prompt_tokens': response.usage.prompt_tokens,
                'completion_tokens': response.usage.completion_tokens,
                'total_tokens': response.usage.total_tokens
            }
        })
    except Exception as e:
        return Response(
            {'error': f'OpenAI API error: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ---------------------------------------------------------------------------
# Mobile chat (Phase 5): streaming, tool-calling music teacher.
# ---------------------------------------------------------------------------
#
# Manual smoke (server running on :8000):
#
#   curl -N -X POST http://localhost:8000/api/mobile/chat/ \
#     -H 'Content-Type: application/json' \
#     -d '{"messages":[{"role":"user","content":"Play a C major chord."}]}'
#
# Expect a `text/event-stream` with `event: text` deltas, an `event: tool_call`
# for play_chord, and a terminal `event: done`.
# ---------------------------------------------------------------------------

MOBILE_TEACHER_SYSTEM_PROMPT = (
    "You are Argyle, a friendly music teacher whose hands are on a shared "
    "isomorphic diamond grid. The user can see and hear everything you do.\n\n"
    "PITCH CONVENTION (MIDI):\n"
    "  C4=60 C#4=61 D4=62 D#4=63 E4=64 F4=65 F#4=66 G4=67 G#4=68 A4=69 "
    "A#4=70 B4=71 C5=72 D5=74 E5=76 F5=77 G5=79 A5=81 B5=83.\n"
    "  Pitch classes for set_key: 0=C 1=C#/Db 2=D 3=D#/Eb 4=E 5=F 6=F#/Gb "
    "7=G 8=G#/Ab 9=A 10=A#/Bb 11=B.\n\n"
    "TOOLS — pick the right one:\n"
    "  • For a SINGLE chord or scale → `play_pattern_from_pitches(pitches, "
    "voicing)`. voicing='block' for a chord, 'arpeggio_up'/'arpeggio_down' "
    "for a scale or broken chord.\n"
    "  • For a MULTI-CHORD PROGRESSION (anything with more than one chord) "
    "→ `play_progression_from_pitches(steps)` — ONE call with a list of "
    "{pitches, duration_ms, label} steps. Do NOT make N separate "
    "play_pattern_from_pitches calls for a progression; that burns the "
    "tool-call budget and the playback won't be cohesive.\n"
    "  • `set_key(root_pitch_class, mode)` — switch the highlighted key. "
    "Do this BEFORE you play tonal material so the grid lights up "
    "correctly. ONE call per key change.\n"
    "  • `play_chord(cells)`/`play_note(cell)`/`play_progression(steps)` "
    "— ONLY if you already have grid cells from a previous tool call. "
    "NEVER guess cell coordinates by hand. If you have pitches, use the "
    "*_from_pitches variants instead.\n"
    "  • `highlight_cells(cells)` / `clear_highlight()` — visual only.\n\n"
    "NASHVILLE NUMBERS — translate first, then play as ONE progression call.\n"
    "  Capital roman = major triad, lowercase = minor, °/dim = diminished. "
    "Build the chord on the appropriate scale degree of the current key.\n\n"
    "  VOICING RULE: keep all chords clustered around middle C (MIDI 60). "
    "Pick the inversion / octave for each chord whose lowest note is "
    "≥ MIDI 55 and highest note is ≤ MIDI 79 — this keeps a balanced "
    "register and avoids muddy or shrill chords. Do NOT just stack each "
    "chord at its root-position lowest pitch (e.g., F3-A3-C4 for IV is "
    "TOO LOW; prefer F4-A4-C5 or first inversion C4-F4-A4).\n\n"
    "  Worked example — '1 5 6 4' (I-V-vi-IV) in C major:\n"
    "    play_progression_from_pitches(steps=[\n"
    "      {pitches:[60,64,67], duration_ms:700, label:'I (C)'},\n"
    "      {pitches:[62,67,71], duration_ms:700, label:'V (G, 2nd inv)'},\n"
    "      {pitches:[60,64,69], duration_ms:700, label:'vi (Am, 1st inv)'},\n"
    "      {pitches:[60,65,69], duration_ms:900, label:'IV (F, 2nd inv)'},\n"
    "    ])\n"
    "  Notice every chord above has its lowest note ≥ MIDI 60 and highest "
    "≤ MIDI 71 — they all sit in the same octave, so the progression "
    "flows smoothly instead of dropping into a muddy bass.\n\n"
    "  Worked example — '1 6 2 5' (I-vi-ii-V) in C major:\n"
    "    [{p:[60,64,67]},{p:[60,64,69]},{p:[62,65,69]},{p:[62,67,71]}]\n\n"
    "CONVERSATION RULES:\n"
    "  • Always include a short text reply alongside your tool calls so the "
    "user can read what's happening. Don't emit tool calls silently.\n"
    "  • If the user asks for a chord, an honest typical flow is: "
    "(1) set_key, (2) play_pattern_from_pitches [60,64,67] block, "
    "(3) one-line text explanation.\n"
    "  • Keep prose brief; the instrument does the heavy lifting.\n\n"
    "The grid is isomorphic: adjacent cells differ by one semitone (one "
    "direction) and by a perfect fifth (the other). The user can tap cells "
    "themselves — feel free to comment on what they play."
)

# OpenAI tool schemas. Cells are { x:int, y:int } grid coordinates; the
# client maps pitches→cells using `getAllCloneCoordsForPitch` from core/.
MOBILE_CHAT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "highlight_cells",
            "description": (
                "Highlight one or more grid cells with no sound. Optionally "
                "auto-clear after duration_ms."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "cells": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "x": {"type": "integer"},
                                "y": {"type": "integer"},
                            },
                            "required": ["x", "y"],
                            "additionalProperties": False,
                        },
                        "minItems": 1,
                    },
                    "duration_ms": {"type": "integer", "minimum": 0},
                },
                "required": ["cells"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "play_chord",
            "description": (
                "Play all given cells simultaneously as a chord and "
                "highlight them for the duration."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "cells": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "x": {"type": "integer"},
                                "y": {"type": "integer"},
                            },
                            "required": ["x", "y"],
                            "additionalProperties": False,
                        },
                        "minItems": 1,
                    },
                    "duration_ms": {"type": "integer", "minimum": 1},
                },
                "required": ["cells"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "play_note",
            "description": "Play a single cell as a single note.",
            "parameters": {
                "type": "object",
                "properties": {
                    "cell": {
                        "type": "object",
                        "properties": {
                            "x": {"type": "integer"},
                            "y": {"type": "integer"},
                        },
                        "required": ["x", "y"],
                        "additionalProperties": False,
                    },
                    "duration_ms": {"type": "integer", "minimum": 1},
                },
                "required": ["cell"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "play_progression",
            "description": (
                "Play a sequence of timed chord steps, highlighting each in "
                "turn. Use to demonstrate progressions or motifs."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "steps": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "cells": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "x": {"type": "integer"},
                                            "y": {"type": "integer"},
                                        },
                                        "required": ["x", "y"],
                                        "additionalProperties": False,
                                    },
                                    "minItems": 1,
                                },
                                "duration_ms": {
                                    "type": "integer",
                                    "minimum": 1,
                                },
                                "label": {"type": "string"},
                            },
                            "required": ["cells", "duration_ms"],
                            "additionalProperties": False,
                        },
                        "minItems": 1,
                    },
                },
                "required": ["steps"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_key",
            "description": (
                "Switch the grid's highlighted key. root_pitch_class is "
                "0=C, 1=C#, ... 11=B."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "root_pitch_class": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 11,
                    },
                    "mode": {
                        "type": "string",
                        "enum": [
                            "major",
                            "natural-minor",
                            "harmonic-minor",
                            "melodic-minor",
                            "dorian",
                            "phrygian",
                            "lydian",
                            "mixolydian",
                            "locrian",
                            "major-pentatonic",
                            "minor-pentatonic",
                            "blues",
                            "chromatic",
                        ],
                    },
                },
                "required": ["root_pitch_class", "mode"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "clear_highlight",
            "description": "Remove all highlights from the grid.",
            "parameters": {
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "play_progression_from_pitches",
            "description": (
                "PREFERRED for multi-chord progressions. Play a sequence of "
                "chord steps, each step a list of MIDI pitches. Highlights "
                "and plays each step in turn. Use this for I-V-vi-IV, ii-V-I, "
                "Nashville-numbers shorthand like '1 6 2 5', etc. — one tool "
                "call covers the entire progression."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "steps": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "pitches": {
                                    "type": "array",
                                    "items": {
                                        "type": "integer",
                                        "minimum": 0,
                                        "maximum": 127,
                                    },
                                    "minItems": 1,
                                },
                                "duration_ms": {"type": "integer", "minimum": 1},
                                "label": {"type": "string"},
                            },
                            "required": ["pitches", "duration_ms"],
                            "additionalProperties": False,
                        },
                        "minItems": 1,
                    },
                },
                "required": ["steps"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "play_pattern_from_pitches",
            "description": (
                "Play a single chord or arpeggio of MIDI pitches. Voicing "
                "controls whether to play them simultaneously (block) or "
                "arpeggiated. For MULTI-chord progressions, prefer "
                "`play_progression_from_pitches` instead."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "pitches": {
                        "type": "array",
                        "items": {
                            "type": "integer",
                            "minimum": 0,
                            "maximum": 127,
                        },
                        "minItems": 1,
                    },
                    "voicing": {
                        "type": "string",
                        "enum": ["block", "arpeggio_up", "arpeggio_down"],
                    },
                    "duration_ms": {"type": "integer", "minimum": 1},
                    "step_ms": {"type": "integer", "minimum": 1},
                },
                "required": ["pitches", "voicing"],
                "additionalProperties": False,
            },
        },
    },
]


def _rate_limit_key(request, user):
    if user is not None:
        return f"mobile_chat:rl:u:{user.id}"
    # Fallback to IP for anonymous.
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    ip = xff.split(",")[0].strip() if xff else request.META.get(
        "REMOTE_ADDR", "anon"
    )
    return f"mobile_chat:rl:ip:{ip}"


def _check_rate_limit(request, user):
    """Returns (allowed, remaining, reset_seconds). 100/day auth, 20/day anon."""
    limit = 100 if user is not None else 20
    key = _rate_limit_key(request, user)
    # Bucket = current calendar day in UTC. Resets at UTC midnight.
    bucket_day = datetime.now(timezone.utc).strftime("%Y%m%d")
    bucketed_key = f"{key}:{bucket_day}"
    current = cache.get(bucketed_key, 0)
    if current >= limit:
        return False, 0
    # 24h TTL is fine — bucket key changes daily anyway.
    try:
        cache.set(bucketed_key, current + 1, timeout=60 * 60 * 24)
    except Exception:
        # Cache backend unavailable — fail open rather than block users.
        pass
    return True, limit - current - 1


def _sse_event(event_type, payload):
    """Format a Server-Sent Event with explicit event name + JSON data."""
    return f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"


def _stream_openai_chat(messages, model):
    """Generator yielding SSE-formatted bytes from an OpenAI streaming call.

    Assembles streamed tool-call fragments into complete tool_call events
    (OpenAI streams them as deltas keyed by index).
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        yield _sse_event("error", {"error": "OpenAI API key not configured"})
        return

    full_messages = [
        {"role": "system", "content": MOBILE_TEACHER_SYSTEM_PROMPT},
        *messages,
    ]

    try:
        client = OpenAI(api_key=api_key)
        stream = client.chat.completions.create(
            model=model,
            messages=full_messages,
            tools=MOBILE_CHAT_TOOLS,
            stream=True,
        )
    except Exception as exc:
        yield _sse_event("error", {"error": f"OpenAI error: {exc}"})
        return

    # tool_calls assemble by index — each delta may contribute a slice of the
    # JSON arguments string. We emit the assembled call once finish_reason
    # arrives (or the call's id stabilizes), but the simplest robust path is
    # to assemble across the whole stream and emit at end.
    tool_calls_by_index = {}
    finish_reason = None

    try:
        for chunk in stream:
            if not chunk.choices:
                continue
            choice = chunk.choices[0]
            delta = choice.delta
            if delta and getattr(delta, "content", None):
                yield _sse_event("text", {"delta": delta.content})
            if delta and getattr(delta, "tool_calls", None):
                for tc_delta in delta.tool_calls:
                    idx = tc_delta.index
                    slot = tool_calls_by_index.setdefault(
                        idx, {"id": None, "name": None, "arguments": ""}
                    )
                    if tc_delta.id:
                        slot["id"] = tc_delta.id
                    fn = getattr(tc_delta, "function", None)
                    if fn is not None:
                        if getattr(fn, "name", None):
                            slot["name"] = fn.name
                        if getattr(fn, "arguments", None):
                            slot["arguments"] += fn.arguments
            if choice.finish_reason:
                finish_reason = choice.finish_reason
    except Exception as exc:
        yield _sse_event("error", {"error": f"Stream error: {exc}"})
        return

    # Emit assembled tool calls now that they're complete.
    for idx in sorted(tool_calls_by_index.keys()):
        slot = tool_calls_by_index[idx]
        try:
            parsed_args = json.loads(slot["arguments"] or "{}")
        except json.JSONDecodeError:
            parsed_args = {"_raw": slot["arguments"]}
        yield _sse_event("tool_call", {
            "id": slot["id"] or f"call_{idx}",
            "name": slot["name"] or "",
            "arguments": parsed_args,
        })

    yield _sse_event("done", {"finish_reason": finish_reason or "stop"})


@api_view(['POST'])
@permission_classes([AllowAny])
@renderer_classes([JSONRenderer, SSERenderer])
def mobile_chat(request):
    """Streaming chat endpoint for the mobile teacher (Phase 5).

    Returns Server-Sent Events with event types: text, tool_call, done, error.
    Tool execution happens client-side; the client appends `role:tool` messages
    to the history for follow-up turns.
    """
    messages = request.data.get("messages")
    if not messages or not isinstance(messages, list):
        return Response(
            {"error": "Invalid messages format"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = _user_from_request(request)
    allowed, _remaining = _check_rate_limit(request, user)
    if not allowed:
        return Response(
            {"error": "Rate limit exceeded. Try again tomorrow."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    model = os.environ.get("OPENAI_MOBILE_MODEL", "gpt-4o")

    response = StreamingHttpResponse(
        _stream_openai_chat(messages, model),
        content_type="text/event-stream",
    )
    # SSE niceties — disable buffering at nginx/whitenoise and proxies.
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    """User login endpoint"""
    email = request.data.get('email')
    password = request.data.get('password')

    if not email or not password:
        return Response(
            {'error': 'Email and password are required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    from django.contrib.auth import authenticate
    user = authenticate(request, username=email, password=password)

    if user:
        response = Response({
            'success': True,
            'user': {
                'id': user.id,
                'email': user.email,
                'name': user.name,
            },
        })
        _issue_auth_cookie(response, user)
        return response

    return Response(
        {'error': 'Invalid credentials'},
        status=status.HTTP_401_UNAUTHORIZED,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def signup(request):
    """User signup endpoint"""
    email = request.data.get('email')
    password = request.data.get('password')
    name = request.data.get('name', '')

    if not email or not password:
        return Response(
            {'error': 'Email and password are required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if User.objects.filter(email=email).exists():
        return Response(
            {'error': 'User with this email already exists'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        user = User.objects.create_user(
            email=email,
            password=password,
            name=name,
        )

        response = Response({
            'success': True,
            'user': {
                'id': user.id,
                'email': user.email,
                'name': user.name,
            },
        }, status=status.HTTP_201_CREATED)
        _issue_auth_cookie(response, user)
        return response
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['GET'])
@permission_classes([AllowAny])
def get_current_user(request):
    """Get current user from JWT token"""
    user = _user_from_request(request)
    if not user:
        return Response(
            {'success': False, 'error': 'Not authenticated'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    return Response({
        'success': True,
        'user': {
            'id': user.id,
            'email': user.email,
            'name': user.name,
        },
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def logout(request):
    """User logout endpoint"""
    response = Response({'success': True})
    response.delete_cookie(AUTH_COOKIE_NAME, path='/')
    return response


class SongViewSet(viewsets.ModelViewSet):
    """Song viewset"""
    serializer_class = SongSerializer
    permission_classes = [AllowAny]  # Will check auth in methods

    def get_queryset(self):
        user = _user_from_request(self.request)
        if user:
            return Song.objects.filter(user=user)
        return Song.objects.none()

    def list(self, request):
        user = _user_from_request(request)
        songs = Song.objects.filter(user=user) if user else Song.objects.none()
        serializer = self.get_serializer(songs, many=True)
        return Response(serializer.data)

    def create(self, request):
        user = _user_from_request(request)
        if not user:
            return Response(
                {'error': 'Authentication required'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        user = _user_from_request(request)
        try:
            song = Song.objects.get(pk=pk)
        except Song.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        if song.user != user and not song.is_public:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(song)
        return Response(serializer.data)
