// SPDX-License-Identifier: Apache-2.0
plugins {
    kotlin("jvm") version "2.2.21"
}

repositories {
    // OpenSAML is published by the Shibboleth Consortium, not to Maven Central.
    exclusiveContent {
        forRepository { maven("https://build.shibboleth.net/maven/releases/") }
        filter { includeGroupByRegex("org\\.opensaml|net\\.shibboleth.*") }
    }
    mavenCentral()
}

dependencies {
    implementation("org.springframework.security:spring-security-saml2-service-provider:7.1.1")
    compileOnly("jakarta.servlet:jakarta.servlet-api:6.1.0")
    testImplementation("jakarta.servlet:jakarta.servlet-api:6.1.0")
    testImplementation("org.springframework:spring-test:7.0.9")
    testImplementation(kotlin("test"))
    testImplementation("org.junit.jupiter:junit-jupiter:5.13.4")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.13.4")
}

kotlin { jvmToolchain(21) }

tasks.test { useJUnitPlatform() }
