fn main() {
    println!("cargo:rerun-if-changed=../src/assets/image-studio.svg");
    tauri_build::build()
}
