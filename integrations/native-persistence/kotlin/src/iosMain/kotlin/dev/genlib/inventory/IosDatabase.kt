// SPDX-License-Identifier: Apache-2.0
package dev.genlib.inventory
import app.cash.sqldelight.driver.native.NativeSqliteDriver
import dev.genlib.inventory.db.InventoryDatabase
// NativeSqliteDriver creates/migrates the versioned SQLite database.
fun iosDatabase(name: String = "inventory.db"): Pair<NativeSqliteDriver, InventoryDatabase> {
    require(name.matches(Regex("[A-Za-z0-9_-]+\\.db"))) { "Use a simple database filename" }
    val driver = NativeSqliteDriver(InventoryDatabase.Schema, name)
    return driver to InventoryDatabase(driver)
}
