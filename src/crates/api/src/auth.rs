//! Shared application-service access for browser HTTP adapters.

use ovload_admin::AdminServices;

pub trait SessionState {
    fn admin_services(&self) -> &AdminServices;
}
