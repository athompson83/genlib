// SPDX-License-Identifier: Apache-2.0
package dev.genlib.genlib_inventory;

import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.Parameterized;
import pl.leancode.patrol.PatrolJUnitRunner;

@RunWith(Parameterized.class)
public class MainActivityTest {
    @Parameterized.Parameters(name = "{0}")
    public static Object[] testCases() {
        PatrolJUnitRunner runner = (PatrolJUnitRunner) InstrumentationRegistry.getInstrumentation();
        runner.setUp(MainActivity.class);
        runner.waitForPatrolAppService();
        return runner.listDartTests();
    }
    private final String dartTestName;
    public MainActivityTest(String dartTestName) { this.dartTestName = dartTestName; }
    @Test
    public void runDartTest() {
        ((PatrolJUnitRunner) InstrumentationRegistry.getInstrumentation()).runDartTest(dartTestName);
    }
}
