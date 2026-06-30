plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.shadow)
}

repositories {
    mavenCentral()
}

dependencies {
    implementation(libs.aws.lambda.java.core)
    implementation(libs.aws.firehose.kotlin)
    implementation(libs.jackson.kotlin)
    implementation(libs.kotlinx.coroutines)
    implementation(libs.log4j.core)
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

tasks.shadowJar {
    archiveFileName.set("app-all.jar")
    mergeServiceFiles()
}

tasks.named<Test>("test") {
    useJUnitPlatform()
}
