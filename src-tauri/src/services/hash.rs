use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::Path;

pub fn compute_file_hash(path: &Path) -> Result<String, String> {
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()));
    }

    let file = std::fs::File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;

    let mut reader = std::io::BufReader::with_capacity(1024 * 1024, file);
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536];

    loop {
        let bytes_read = reader
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        if bytes_read == 0 {
            break;
        }

        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hex::encode(hasher.finalize()))
}
