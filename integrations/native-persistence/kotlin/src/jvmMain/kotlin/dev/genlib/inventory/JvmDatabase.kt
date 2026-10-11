// SPDX-License-Identifier: Apache-2.0
package dev.genlib.inventory
import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import dev.genlib.inventory.db.InventoryDatabase
// Caller owns the driver lifetime. For persistent files, use a versioned driver
// schema/migration strategy; this factory intentionally creates an in-memory fixture.
fun memoryDatabase(): Pair<JdbcSqliteDriver, InventoryDatabase> {
    val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
    InventoryDatabase.Schema.create(driver)
    return driver to InventoryDatabase(driver)
}
