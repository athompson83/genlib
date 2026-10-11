// SPDX-License-Identifier: Apache-2.0
package dev.genlib.inventory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails
import kotlin.test.assertTrue
class InventoryRepositoryTest {
    @Test fun transactionsAndCompletion() {
        val (driver, db) = memoryDatabase()
        try {
            val repository = InventoryRepository(db)
            repository.addAll(listOf("a" to " One ", "b" to "Two"))
            repository.complete("a", true)
            assertTrue(repository.active().first().completed)
            assertEquals("One", repository.active().first().title)
            assertFails { repository.addAll(listOf("c" to "Three", "d" to "")) }
            assertEquals(listOf("a", "b"), repository.active().map { it.id })
            assertFails { repository.complete("missing", true) }
            repository.archive("a")
            assertEquals(listOf("b"), repository.active().map { it.id })
        } finally { driver.close() }
    }
}
