// SPDX-License-Identifier: Apache-2.0
plugins {
    kotlin("multiplatform") version "2.4.21"
    id("app.cash.sqldelight") version "2.4.1"
}
kotlin {
    jvm()
    iosArm64()
    iosSimulatorArm64()
    sourceSets {
        commonMain.dependencies { implementation("app.cash.sqldelight:runtime:2.4.1") }
        commonTest.dependencies { implementation(kotlin("test")) }
        jvmMain.dependencies { implementation("app.cash.sqldelight:sqlite-driver:2.4.1") }
        iosMain.dependencies { implementation("app.cash.sqldelight:native-driver:2.4.1") }
    }
}
sqldelight {
    databases {
        create("InventoryDatabase") {
            packageName.set("dev.genlib.inventory.db")
            verifyMigrations.set(true)
        }
    }
}
