from __future__ import annotations

from app.core.security import hash_token


class TestHashToken:
    def test_is_sha256_hex(self):
        assert (
            hash_token("abc")
            == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        )
