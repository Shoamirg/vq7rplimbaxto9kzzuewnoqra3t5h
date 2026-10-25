package uz.garageos.garageos_staff;

import androidx.test.rule.ActivityTestRule;
import androidx.test.platform.app.InstrumentationRegistry;
import android.Manifest;
import android.os.Build;
import dev.flutter.plugins.integration_test.FlutterTestRunner;
import org.junit.Rule;
import org.junit.runner.RunWith;

/** Runs Flutter's actual integration suite through Android instrumentation. */
@RunWith(FlutterTestRunner.class)
public class MainActivityTest {
    @Rule
    public ActivityTestRule<MainActivity> rule =
        new ActivityTestRule<MainActivity>(MainActivity.class, true, false) {
            @Override
            protected void beforeActivityLaunched() {
                String target = InstrumentationRegistry.getInstrumentation()
                    .getTargetContext().getPackageName();
                if (!target.endsWith(".dev")) {
                    throw new IllegalStateException("Only GarageOS Dev may run local acceptance");
                }
                // The user approved synthetic location on this virtual device.
                if (Build.VERSION.SDK_INT >= 28) {
                    InstrumentationRegistry.getInstrumentation().getUiAutomation()
                        .grantRuntimePermission(target, Manifest.permission.ACCESS_COARSE_LOCATION);
                    InstrumentationRegistry.getInstrumentation().getUiAutomation()
                        .grantRuntimePermission(target, Manifest.permission.ACCESS_FINE_LOCATION);
                }
            }
        };
}
