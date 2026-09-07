import time

from core.app import create_app


def main() -> None:
    app = create_app()
    with app.app_context():
        from core.services.rag.service import (
            get_rag_chunk_count,
            invalidate_rag_status_cache,
            is_rag_available,
        )
        from core.services.ai.builtin_ai_config_db import ensure_vision_seeded_from_env

        invalidate_rag_status_cache()
        t = time.time()
        a = is_rag_available()
        c = get_rag_chunk_count()
        print("rag cold", round((time.time() - t) * 1000), "ms", a, c)
        t = time.time()
        a = is_rag_available()
        c = get_rag_chunk_count()
        print("rag warm", round((time.time() - t) * 1000), "ms", a, c)

        t = time.time()
        ensure_vision_seeded_from_env()
        print("seed1", round((time.time() - t) * 1000), "ms")
        t = time.time()
        ensure_vision_seeded_from_env()
        print("seed2", round((time.time() - t) * 1000), "ms")


if __name__ == "__main__":
    main()
