import java.net.URI
import java.net.InetAddress
import java.security.KeyStore
import java.util.Base64
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Prefer a complete environment configuration, otherwise use a private file.
// Never include secret values in diagnostics or substitute the debug identity.
val signingVariables = mapOf(
    "storeFile" to "GARAGEOS_ANDROID_KEYSTORE",
    "storePassword" to "GARAGEOS_ANDROID_STORE_PASSWORD",
    "keyAlias" to "GARAGEOS_ANDROID_KEY_ALIAS",
    "keyPassword" to "GARAGEOS_ANDROID_KEY_PASSWORD",
)
val signingProperties = Properties()
var signingFileInvalid = false
val environmentSigning = signingVariables.values.any { System.getenv(it) != null }
if (!environmentSigning) {
    val propertiesFile = rootProject.file(
        System.getenv("GARAGEOS_ANDROID_SIGNING_PROPERTIES") ?: "key.properties",
    )
    if (propertiesFile.exists()) {
        try {
            propertiesFile.inputStream().use { signingProperties.load(it) }
        } catch (_: Exception) {
            signingProperties.clear()
            signingFileInvalid = true
        }
    }
}
fun signingValue(name: String): String? = if (environmentSigning) {
    System.getenv(signingVariables.getValue(name))
} else {
    signingProperties.getProperty(name)
}

val validateGarageOSRelease = tasks.register("validateGarageOSRelease") {
    doLast {
        if (signingFileInvalid || signingVariables.keys.any { signingValue(it).isNullOrEmpty() }) {
            throw GradleException("GarageOS release requires a complete private signing configuration; see docs/android-release.md.")
        }
        try {
            val store = rootProject.file(signingValue("storeFile")!!)
            val keyStore = KeyStore.getInstance(store, signingValue("storePassword")!!.toCharArray())
            val alias = signingValue("keyAlias")!!
            require(keyStore.getKey(alias, signingValue("keyPassword")!!.toCharArray()) is java.security.PrivateKey)
            val certificate = keyStore.getCertificate(alias) as java.security.cert.X509Certificate
            require(!certificate.subjectX500Principal.name.replace(Regex("\\s+"), "").contains("CN=AndroidDebug", ignoreCase = true))
            certificate.checkValidity()
        } catch (_: Exception) {
            throw GradleException("GarageOS release signing is invalid or uses an Android debug certificate; check the keystore, alias and passwords privately.")
        }
        val apiValues = try {
            (providers.gradleProperty("dart-defines").orNull ?: "").split(',')
                .filter { it.isNotEmpty() }
                .map { String(Base64.getDecoder().decode(it), Charsets.UTF_8) }
                .filter { it.startsWith("API_URL=") }.map { it.removePrefix("API_URL=") }
        } catch (_: Exception) {
            emptyList()
        }
        val validApi = try {
            val uri = URI(apiValues.single())
            val host = uri.host?.removeSurrounding("[", "]")?.lowercase()?.removeSuffix(".") ?: ""
            // Normalize literal addresses without resolving user DNS names.
            val localAddress = if (host.contains(':') || host.matches(Regex("[0-9.]+"))) {
                val address = InetAddress.getByName(host)
                address.isLoopbackAddress || address.isAnyLocalAddress ||
                    address.hostAddress in listOf("10.0.2.2", "10.0.3.2")
            } else false
            uri.scheme.equals("https", ignoreCase = true) && host.isNotEmpty() && !localAddress &&
                host !in listOf("localhost", "0.0.0.0", "::", "::1", "10.0.2.2", "10.0.3.2") &&
                !host.startsWith("127.") && !host.endsWith(".localhost") &&
                uri.userInfo == null && uri.query == null && uri.fragment == null &&
                uri.path in listOf("/api/v1", "/api/v1/") &&
                (uri.port == -1 || uri.port in 1..65535)
        } catch (_: Exception) {
            false
        }
        if (!validApi) {
            throw GradleException("GarageOS Android release requires one explicit HTTPS API_URL ending in /api/v1, without loopback/emulator hosts, credentials, query or fragment.")
        }
    }
}

tasks.configureEach {
    if (name == "compileFlutterBuildRelease" || name == "validateSigningRelease") {
        dependsOn(validateGarageOSRelease)
    }
}

android {
    namespace = "uz.garageos.garageos_staff"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        manifestPlaceholders["appLabel"] = "GarageOS"
        // Keep this identity stable: Android uses it together with the signing
        // certificate to decide whether an APK can update an installed app.
        applicationId = "uz.garageos.garageos_staff"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            storeFile = signingValue("storeFile")?.takeIf { it.isNotEmpty() }?.let { rootProject.file(it) }
            storePassword = signingValue("storePassword")
            keyAlias = signingValue("keyAlias")
            keyPassword = signingValue("keyPassword")
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".dev"
            manifestPlaceholders["appLabel"] = "GarageOS Dev"
        }
        release {
            manifestPlaceholders["appLabel"] = "GarageOS"
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    // AGP 9 resolves test and app classpaths consistently. Flutter's integration
    // plugin also exposes these helpers on the debug app classpath.
    debugImplementation("androidx.test:runner:1.7.0")
    debugImplementation("androidx.test:rules:1.7.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test:rules:1.7.0")
}
