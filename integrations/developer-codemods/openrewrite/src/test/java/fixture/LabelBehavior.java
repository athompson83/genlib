// SPDX-License-Identifier: Apache-2.0
package fixture;

import legacy.inventory.Label;

public final class LabelBehavior {
    public static void main(String[] args) {
        if (!Label.display("  Inventory  ").equals("Inventory")) throw new AssertionError("Whitespace normalization changed");
        if (!Label.display("\t\n").equals("")) throw new AssertionError("Empty-title behavior changed");
        if (!Label.display("Café").equals("Café")) throw new AssertionError("Unicode content changed");
    }
}
