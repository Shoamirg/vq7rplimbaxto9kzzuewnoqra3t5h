"""Exercise actual Android release tasks with disposable signing identities.

All artifacts are QA ONLY. This neither creates an owner key nor deploys an API.
The fixture key/password file remains outside the app and evidence directories.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile


SIGNING = ["GARAGEOS_ANDROID_KEYSTORE", "GARAGEOS_ANDROID_STORE_PASSWORD",
           "GARAGEOS_ANDROID_KEY_ALIAS", "GARAGEOS_ANDROID_KEY_PASSWORD",
           "GARAGEOS_ANDROID_SIGNING_PROPERTIES"]
API = "https://qa.garageos.example/api/v1"
NS = "{http://schemas.android.com/apk/res/android}"


def verify_flutter_bundle(apk):
    """Inspect the delivered APK, independently of Gradle build success."""
    prefix = "assets/flutter_assets/"
    with zipfile.ZipFile(apk) as bundle:
        def read(asset):
            try:
                data = bundle.read(prefix + asset)
            except KeyError as error:
                raise RuntimeError(f"{apk.name}: missing Flutter asset {asset}") from error
            if not data:
                raise RuntimeError(f"{apk.name}: empty Flutter asset {asset}")
            return data

        read("AssetManifest.bin")
        fonts = json.loads(read("FontManifest.json"))
        families = {entry["family"] for entry in fonts}
        required = {"MaterialIcons", "DM Sans", "Golos Text", "Plus Jakarta Sans"}
        if not required.issubset(families):
            raise RuntimeError(f"{apk.name}: required icon/design font families are missing")
        for entry in fonts:
            if not entry.get("fonts"):
                raise RuntimeError(f"{apk.name}: font family has no packaged fonts")
            for font in entry["fonts"]:
                data = read(font["asset"])
                if data[:4] not in {b"OTTO", b"\x00\x01\x00\x00", b"ttcf"}:
                    raise RuntimeError(f"{apk.name}: invalid packaged font {font['asset']}")
        abis = {n.split('/')[1] for n in bundle.namelist()
                if n.startswith('lib/') and n.endswith('/libflutter.so')}
        for abi in abis:
            if bundle.getinfo(f"lib/{abi}/libapp.so").file_size == 0:
                raise RuntimeError(f"{apk.name}: empty AOT application")
        return {"font_families": sorted(families),
                "asset_count": sum(n.startswith(prefix) for n in bundle.namelist())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", type=Path, required=True)
    parser.add_argument("--flutter", type=Path, required=True)
    parser.add_argument("--sdk", type=Path, required=True)
    parser.add_argument("--java-home", type=Path, required=True)
    parser.add_argument("--gradle-user-home", type=Path, required=True)
    parser.add_argument("--private-directory", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    app, output, private = args.app.resolve(), args.output.resolve(), args.private_directory.resolve()
    if (app / "android/key.properties").exists():
        raise RuntimeError("Refusing QA in an app with an owner signing file; use an isolated checkout")
    checkouts = {parent for start in (app, Path(__file__).resolve().parent)
                 for parent in (start, *start.parents) if (parent / ".git").exists()}
    if private.is_relative_to(app) or any(private.is_relative_to(root) for root in checkouts):
        raise RuntimeError("Private signing fixtures must remain outside the app and Git checkouts")
    if private.is_relative_to(output) or output.is_relative_to(private):
        raise RuntimeError("Private signing fixtures and archived evidence must be separate")
    private.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    gradle_home = args.gradle_user_home.resolve()
    if gradle_home == (Path.home() / ".gradle").resolve():
        raise RuntimeError("Refusing to stop daemons in the user's shared Gradle home")
    marker = gradle_home / ".garageos-android-qa"
    if gradle_home.exists() and any(gradle_home.iterdir()) and not marker.is_file():
        raise RuntimeError("Refusing to adopt an existing unmarked Gradle home")
    gradle_home.mkdir(parents=True, exist_ok=True)
    if marker.exists() and marker.read_text() != "GarageOS Android QA\n":
        raise RuntimeError("Gradle home belongs to a different owner")
    marker.write_text("GarageOS Android QA\n")
    workspace = Path(tempfile.mkdtemp(prefix="android release qa ", dir=private)).resolve()
    java = args.java_home / "bin/java.exe"
    keytool = args.java_home / "bin/keytool.exe"
    environment = {k: v for k, v in os.environ.items() if k not in SIGNING}
    environment.update(JAVA_HOME=str(args.java_home), ANDROID_HOME=str(args.sdk), PYTHONUTF8="1",
                       GRADLE_USER_HOME=str(gradle_home))
    password = secrets.token_hex(24)
    results = []

    def run(command, name, *, env=None, expected=None, cwd=app):
        result = subprocess.run([str(v) for v in command], cwd=cwd, env=env or environment,
                                capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=900)
        text = result.stdout + result.stderr
        if password in text:
            raise RuntimeError("Signing test exposed a fixture password; raw output withheld")
        (output / (name + ".log")).write_text(text, encoding="utf-8")
        passed = result.returncode == 0 if expected is None else result.returncode != 0 and expected in text
        if not passed:
            print(text[-5000:], flush=True)
            raise RuntimeError(name + " did not produce the expected result")
        results.append({"gate": name, "exit_code": result.returncode, "expected_failure": expected is not None})
        print("Android gate passed: " + name, flush=True)
        return text

    def defines(url):
        return "-Pdart-defines=" + base64.b64encode(("API_URL=" + url).encode()).decode()

    gradle = [java, "-classpath", app / "android/gradle/wrapper/gradle-wrapper.jar",
              "org.gradle.wrapper.GradleWrapperMain", "--no-daemon", "--console=plain"]
    complete = "GarageOS release requires a complete private signing configuration"
    invalid = "GarageOS release signing is invalid or uses an Android debug certificate"
    api_error = "GarageOS Android release requires one explicit HTTPS API_URL"
    try:
        # Use Flutter itself first: it must invoke the guard and bootstrap the
        # normal wrapper/local.properties, rather than testing a helper replica.
        run([args.flutter, "build", "apk", "--release", "--target-platform", "android-arm64",
             "--dart-define=API_URL=" + API], "missing-signing", expected=complete)
        for name, dn in [("release", "CN=GarageOS QA,O=Local tests,C=UZ"),
                         ("debug", "CN=Android Debug,O=Android,C=US")]:
            key_env = dict(environment, GARAGEOS_QA_STORE_PASSWORD=password)
            run([keytool, "-genkeypair", "-keystore", workspace / (name + ".p12"),
                 "-storetype", "PKCS12", "-storepass:env", "GARAGEOS_QA_STORE_PASSWORD",
                 "-keypass:env", "GARAGEOS_QA_STORE_PASSWORD", "-alias", "qa", "-keyalg", "RSA",
                 "-keysize", "2048", "-validity", "30", "-dname", dn], "key-" + name, env=key_env)
        signed = dict(environment, GARAGEOS_ANDROID_KEYSTORE=str(workspace / "release.p12"),
                      GARAGEOS_ANDROID_STORE_PASSWORD=password, GARAGEOS_ANDROID_KEY_ALIAS="qa",
                      GARAGEOS_ANDROID_KEY_PASSWORD=password)
        preflight = gradle + ["app:validateGarageOSRelease", defines(API)]
        for name, changes, message in [
            ("incomplete-signing", {"GARAGEOS_ANDROID_KEY_PASSWORD": ""}, complete),
            ("missing-keystore", {"GARAGEOS_ANDROID_KEYSTORE": str(workspace / "absent.p12")}, invalid),
            ("wrong-password", {"GARAGEOS_ANDROID_STORE_PASSWORD": "invalid-fixture-password"}, invalid),
            ("wrong-key-password", {"GARAGEOS_ANDROID_KEY_PASSWORD": "invalid-fixture-password"}, invalid),
            ("wrong-alias", {"GARAGEOS_ANDROID_KEY_ALIAS": "missing"}, invalid),
            ("debug-certificate", {"GARAGEOS_ANDROID_KEYSTORE": str(workspace / "debug.p12")}, invalid),
        ]:
            run(preflight, name, env=dict(signed, **changes), expected=message, cwd=app / "android")
        for name, url in [
            ("missing-api", ""), ("http-emulator-api", "http://10.0.2.2:8000/api/v1"),
            ("https-loopback-api", "https://127.0.0.1/api/v1"),
            ("ipv6-loopback-api", "https://[::1]/api/v1"),
            ("expanded-ipv6-loopback-api", "https://[0:0:0:0:0:0:0:1]/api/v1"),
            ("mapped-loopback-api", "https://[::ffff:127.0.0.1]/api/v1"),
            ("root-dot-localhost-api", "https://localhost./api/v1"),
            ("root-dot-child-localhost-api", "https://child.localhost./api/v1"),
            ("credential-api", "https://fixture:fixture@qa.garageos.example/api/v1"),
            ("query-api", API + "?fixture=1"), ("fragment-api", API + "#fixture"),
            ("wrong-path-api", "https://qa.garageos.example/api/v2"),
        ]:
            run(gradle + ["app:validateGarageOSRelease", defines(url)], name, env=signed,
                expected=api_error, cwd=app / "android")
        properties = workspace / "signing.properties"
        properties.write_text("storeFile=" + (workspace / "release.p12").as_posix() + "\n"
                              + f"storePassword={password}\nkeyAlias=qa\nkeyPassword={password}\n", encoding="ascii")
        run(preflight, "private-properties", env=dict(environment, GARAGEOS_ANDROID_SIGNING_PROPERTIES=str(properties)),
            cwd=app / "android")
        run([args.flutter, "build", "apk", "--release", "--split-per-abi", "--dart-define=API_URL=" + API],
            "signed-split-apks", env=signed)
        cert = workspace / "certificate.der"
        run([keytool, "-exportcert", "-keystore", workspace / "release.p12", "-alias", "qa", "-file", cert,
             "-storepass:env", "GARAGEOS_QA_STORE_PASSWORD"], "export-public-certificate",
            env=dict(environment, GARAGEOS_QA_STORE_PASSWORD=password))
        expected_fingerprint = hashlib.sha256(cert.read_bytes()).hexdigest()
        sdk_tools = args.sdk / "cmdline-tools/latest"
        build_tools = args.sdk / "build-tools/36.0.0"
        analyzer = [java, "-Dcom.android.sdklib.toolsdir=" + str(sdk_tools), "-classpath",
                    sdk_tools / "lib/apkanalyzer-classpath.jar", "com.android.tools.apk.analyzer.ApkAnalyzerCli"]
        signer = [java, "-jar", build_tools / "lib/apksigner.jar", "verify", "--print-certs"]
        artifacts = []
        apks = sorted((app / "build/app/outputs/flutter-apk").glob("app-*-release.apk"))
        if len(apks) != 3:
            raise RuntimeError("Expected three actual split APKs")
        for apk in apks:
            flutter_assets = verify_flutter_bundle(apk)
            results.append({"gate": apk.stem + "-flutter-assets", "exit_code": 0,
                            "expected_failure": False})
            print("Android gate passed: " + apk.stem + "-flutter-assets", flush=True)
            signature = run(signer + [apk], apk.stem + "-signature")
            digest = re.search(r"Signer #1 certificate SHA-256 digest: ([0-9a-f]+)", signature)
            assert digest and digest.group(1) == expected_fingerprint
            assert "Android Debug" not in signature
            manifest = run(analyzer + ["manifest", "print", apk], apk.stem + "-manifest")
            tree = ET.fromstring(manifest)
            assert tree.get("package") == "uz.garageos.garageos_staff"
            application = tree.find("application")
            assert application is not None and application.get(NS + "debuggable", "false") == "false"
            assert application.get(NS + "networkSecurityConfig") is None
            target = int(tree.find("uses-sdk").get(NS + "targetSdkVersion"))
            assert application.get(NS + "usesCleartextTraffic", "false" if target >= 28 else "true") == "false"
            assert any(p.get(NS + "name") == "android.permission.INTERNET" for p in tree.findall("uses-permission"))
            with zipfile.ZipFile(apk) as bundle:
                abi = sorted({n.split('/')[1] for n in bundle.namelist() if n.startswith('lib/') and n.endswith('/libflutter.so')})
            assert len(abi) == 1 and abi[0] in {"armeabi-v7a", "arm64-v8a", "x86_64"}
            artifacts.append({"file": apk.name, "bytes": apk.stat().st_size, "sha256": hashlib.sha256(apk.read_bytes()).hexdigest(),
                              "certificate_sha256": expected_fingerprint, "application_id": tree.get("package"),
                              "version_name": tree.get(NS + "versionName"), "version_code": tree.get(NS + "versionCode"),
                              "abi": abi, "debuggable": False, "manifest_cleartext_allowed": False,
                              "flutter_assets": flutter_assets})
            shutil.copyfile(apk, output / ("QA-ONLY-" + apk.name))
        assert {a["abi"][0] for a in artifacts} == {"armeabi-v7a", "arm64-v8a", "x86_64"}
        run([args.flutter, "build", "apk", "--debug", "--target-platform", "android-arm64"], "debug-build")
        summary = {"qa_only": True, "api": API, "owner_release": False, "gates": results,
                   "artifacts": artifacts, "physical_device_verified": False}
    finally:
        stop_failed = False
        if (app / "android/gradle/wrapper/gradle-wrapper.jar").exists():
            try:
                stopped = subprocess.run([str(v) for v in gradle + ["--stop"]], cwd=app / "android", env=environment,
                                         capture_output=True, timeout=60)
                stop_failed = stopped.returncode != 0
            except (OSError, subprocess.TimeoutExpired):
                stop_failed = True
        # Check the final resolved deletion target before recursive cleanup.
        if workspace.parent != private or not workspace.name.startswith("android release qa "):
            raise RuntimeError("Refusing signing fixture cleanup outside the owned directory")
        shutil.rmtree(workspace)
        if workspace.exists():
            raise RuntimeError("Private signing fixture remains")
        if stop_failed:
            raise RuntimeError("Owned Gradle cleanup failed")
    summary["private_fixture_cleanup"] = True
    (output / "android-release-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
