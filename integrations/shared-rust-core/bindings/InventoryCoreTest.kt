// SPDX-License-Identifier: Apache-2.0
// Add to the host JVM/Android test source set after linking generated Kotlin + JNA/native library.
package dev.genlib.inventory.core
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails
import kotlin.test.assertTrue
class InventoryCoreTest {
    @Test fun crossLanguageTransition() {
        var items = applyChange(emptyList(), Change.Add("one", "  Ship integration  "))
        items = applyChange(items, Change.Complete("one", true))
        assertEquals("Ship integration", items[0].title)
        assertTrue(items[0].completed)
        assertFails { normalizeTitle(" ") }
    }
}
