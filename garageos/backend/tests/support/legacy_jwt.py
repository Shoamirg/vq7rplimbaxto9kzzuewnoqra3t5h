"""Independent legacy HS256 wire encoder, checked against frozen jose vectors."""
import base64
import hashlib
import hmac
import json


def legacy_hs256(claims, secret):
    def segment(value):
        return base64.urlsafe_b64encode(value).rstrip(b"=")
    header = segment(b'{"alg":"HS256","typ":"JWT"}')
    payload = segment(json.dumps(claims, separators=(",", ":")).encode("utf-8"))
    body = header + b"." + payload
    signature = segment(hmac.new(secret.encode("utf-8"), body, hashlib.sha256).digest())
    return (body + b"." + signature).decode("ascii")
