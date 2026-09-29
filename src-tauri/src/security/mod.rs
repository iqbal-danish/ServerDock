use std::path::{Path, PathBuf};

const SERVICE_NAME: &str = "byteflow-credentials";

pub struct CredentialManager;

impl CredentialManager {
    /// Store a credential safely in the OS credential store
    pub fn store_secret(profile_id: &str, secret: &str) -> Result<(), String> {
        let entry = keyring::Entry::new(SERVICE_NAME, profile_id)
            .map_err(|e| format!("Failed to create keyring entry: {e}"))?;
        entry
            .set_password(secret)
            .map_err(|e| format!("Failed to store secret in OS credential store: {e}"))?;
        Ok(())
    }

    /// Retrieve a credential from the OS credential store
    pub fn get_secret(profile_id: &str) -> Result<Option<String>, String> {
        let entry = keyring::Entry::new(SERVICE_NAME, profile_id)
            .map_err(|e| format!("Failed to create keyring entry: {e}"))?;
        match entry.get_password() {
            Ok(pass) => Ok(Some(pass)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("Failed to retrieve secret from OS credential store: {e}")),
        }
    }

    /// Delete a credential from the OS credential store
    pub fn delete_secret(profile_id: &str) -> Result<(), String> {
        let entry = keyring::Entry::new(SERVICE_NAME, profile_id)
            .map_err(|e| format!("Failed to create keyring entry: {e}"))?;
        match entry.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("Failed to delete secret from OS credential store: {e}")),
        }
    }

    /// Check if a credential exists in the OS credential store
    pub fn has_secret(profile_id: &str) -> bool {
        Self::get_secret(profile_id).unwrap_or(None).is_some()
    }
}

/// Path security helper to prevent path traversal attacks
pub fn sanitize_relative_path(base: &Path, rel: &str) -> Result<PathBuf, String> {
    let mut normalized = PathBuf::new();
    for component in Path::new(rel).components() {
        match component {
            std::path::Component::Normal(c) => normalized.push(c),
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                return Err("Path traversal (..) is not permitted".to_string());
            }
            std::path::Component::RootDir | std::path::Component::Prefix(_) => {
                return Err("Absolute path components are not permitted in relative path".to_string());
            }
        }
    }
    Ok(base.join(normalized))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credential_manager_roundtrip() {
        let test_id = "test-profile-uuid-999";
        let test_pass = "super_secret_test_password";
        let res1 = CredentialManager::store_secret(test_id, test_pass);
        assert!(res1.is_ok(), "store_secret failed: {:?}", res1);

        let res2 = CredentialManager::get_secret(test_id);
        assert_eq!(res2.unwrap(), Some(test_pass.to_string()));
        assert!(CredentialManager::has_secret(test_id));

        let res3 = CredentialManager::delete_secret(test_id);
        assert!(res3.is_ok(), "delete_secret failed: {:?}", res3);

        let res4 = CredentialManager::get_secret(test_id);
        assert_eq!(res4.unwrap(), None);
        assert!(!CredentialManager::has_secret(test_id));
    }
}
