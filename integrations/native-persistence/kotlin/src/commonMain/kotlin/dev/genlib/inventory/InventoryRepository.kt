// SPDX-License-Identifier: Apache-2.0
package dev.genlib.inventory

import dev.genlib.inventory.db.InventoryDatabase
import dev.genlib.inventory.db.Item

class InventoryRepository(private val database: InventoryDatabase) {
    fun active(): List<Item> = database.itemQueries.listActive().executeAsList()
    fun addAll(items: List<Pair<String, String>>) {
        database.transaction {
            items.forEach { (id, rawTitle) ->
                val title = rawTitle.trim()
                require(id.isNotBlank()) { "An ID is required" }
                require(title.length in 1..200) { "Title must contain 1 to 200 characters" }
                database.itemQueries.insertItem(id, title)
            }
        }
    }
    fun complete(id: String, completed: Boolean) {
        database.transaction {
            requireNotNull(database.itemQueries.findById(id).executeAsOneOrNull()) { "Unknown item" }
            database.itemQueries.setCompleted(completed, id)
        }
    }
    fun archive(id: String) = database.itemQueries.archiveItem(id)
}
