"""Template context helpers."""

import os
import time

# Stable per-process release identifier. Tied to Fly's per-machine version
# when available so a `fly deploy` rotates it for every container start;
# otherwise falls back to a process-start timestamp (good enough to bust
# the cache for local dev).
_RELEASE_ID = (
    os.environ.get("FLY_MACHINE_VERSION")
    or os.environ.get("RELEASE_ID")
    or str(int(time.time()))
)


def release_id(_request):
    """Inject `release_id` into every template context for cache-busting."""
    return {"release_id": _RELEASE_ID}
