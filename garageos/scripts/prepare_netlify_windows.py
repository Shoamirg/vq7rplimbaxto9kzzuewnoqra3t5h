"""Normalize OpenNext's generated Lambda loader paths after a Windows build.

Run after `netlify build` and before an authenticated `netlify deploy --no-build`.
Linux builds are unchanged. Only generated files in admin-dashboard/.netlify
are modified; application source and function dependencies are preserved.
"""
from pathlib import Path
import re
import zipfile


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "admin-dashboard" / ".netlify"
HANDLER = "___netlify-server-handler.mjs"
WINDOWS_LAMBDA_PATH = re.compile(r"'(\\var\\task[^'\r\n]*)'")


def normalize(text: str) -> tuple[str, int]:
    return WINDOWS_LAMBDA_PATH.subn(
        lambda match: "'" + match.group(1).replace("\\", "/") + "'", text
    )


def main() -> None:
    loader = ARTIFACTS / "functions-internal" / "___netlify-server-handler" / HANDLER
    archive = ARTIFACTS / "functions" / "___netlify-server-handler.zip"
    temporary = archive.with_suffix(".normalized.zip")
    for target in (loader, archive, temporary):
        if not target.resolve().is_relative_to(ARTIFACTS.resolve()):
            raise ValueError("Generated artifact escaped the frontend artifact directory")

    loader_text, loader_count = normalize(loader.read_text(encoding="utf-8"))
    with zipfile.ZipFile(archive) as source:
        names = source.namelist()
        if names.count(HANDLER) != 1:
            raise ValueError("Expected exactly one Lambda entry point")
        bundled_text, bundled_count = normalize(source.read(HANDLER).decode("utf-8"))
        for target in re.findall(r"'(/var/task/[^']+\.(?:cjs|js))'", bundled_text):
            if target.removeprefix("/var/task/") not in names:
                raise ValueError("Normalized runtime module is missing from the function archive")
        if not loader_count and not bundled_count:
            print("Lambda loader paths already use Linux paths")
            return
        with zipfile.ZipFile(temporary, "w") as destination:
            for entry in source.infolist():
                data = bundled_text.encode("utf-8") if entry.filename == HANDLER else source.read(entry)
                destination.writestr(entry, data)
    temporary.replace(archive)
    loader.write_text(loader_text, encoding="utf-8", newline="\n")
    print(f"Normalized {loader_count} loader paths and {bundled_count} archived paths")


if __name__ == "__main__":
    main()
