// SPDX-License-Identifier: Apache-2.0
plugins {
    kotlin("jvm") version "2.2.21"
}

repositories { mavenCentral() }

dependencies {
    implementation("com.nimbusds:nimbus-jose-jwt:10.10")
    testImplementation(kotlin("test"))
    testImplementation("org.junit.jupiter:junit-jupiter:5.13.4")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.13.4")
}

kotlin { jvmToolchain(21) }

tasks.test { useJUnitPlatform() }
