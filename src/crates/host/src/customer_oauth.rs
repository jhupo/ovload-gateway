//! Customer OAuth adapter with fixed destinations and bounded response bodies.
use ovload_admin::{
    model::identity_access::{IdentityError, IdentityResult},
    ports::customer_oauth::{CustomerOAuth, ExternalSubject},
};
use secrecy::{ExposeSecret as _, SecretString};
use serde::Deserialize;
use std::{collections::BTreeMap, path::Path, sync::Arc, time::Duration};
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Provider {
    client_id: String,
    client_secret: SecretString,
    redirect_uri: String,
}
pub struct CustomerOAuthClient {
    providers: BTreeMap<String, Provider>,
    http: reqwest::Client,
}
fn endpoints(
    provider: &str,
) -> IdentityResult<(&'static str, &'static str, &'static str, &'static str)> {
    match provider {
        "github" => Ok((
            "https://github.com/login/oauth/authorize",
            "https://github.com/login/oauth/access_token",
            "https://api.github.com/user",
            "read:user",
        )),
        "google" => Ok((
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://oauth2.googleapis.com/token",
            "https://openidconnect.googleapis.com/v1/userinfo",
            "openid profile email",
        )),
        "linuxdo" => Ok((
            "https://connect.linux.do/oauth2/authorize",
            "https://connect.linux.do/oauth2/token",
            "https://connect.linux.do/api/user",
            "user",
        )),
        _ => Err(IdentityError::Invalid),
    }
}
pub async fn load(path: Option<&Path>) -> IdentityResult<Option<Arc<dyn CustomerOAuth>>> {
    let bytes = if let Some(path) = path {
        tokio::fs::read(path)
            .await
            .map_err(|_| IdentityError::Unavailable)?
    } else {
        b"{}".to_vec()
    };
    if bytes.len() > 32768 {
        return Err(IdentityError::Invalid);
    }
    let providers: BTreeMap<String, Provider> =
        serde_json::from_slice(&bytes).map_err(|_| IdentityError::Invalid)?;
    for (key, p) in &providers {
        endpoints(key)?;
        let uri = reqwest::Url::parse(&p.redirect_uri).map_err(|_| IdentityError::Invalid)?;
        if uri.scheme() != "https"
            || uri.host_str().is_none()
            || !uri.username().is_empty()
            || uri.password().is_some()
            || uri.query().is_some()
            || uri.fragment().is_some()
            || uri.path() != format!("/api/v1/auth/oauth/{key}/callback")
            || p.client_id.is_empty()
            || p.client_secret.expose_secret().is_empty()
        {
            return Err(IdentityError::Invalid);
        }
    }
    let http = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(15))
        .user_agent("Ovload-Gateway")
        .build()
        .map_err(|_| IdentityError::Unavailable)?;
    Ok(Some(Arc::new(CustomerOAuthClient { providers, http })))
}
async fn json(response: reqwest::Response) -> IdentityResult<serde_json::Value> {
    if !response.status().is_success() {
        return Err(IdentityError::Unauthorized);
    }
    let mut response = response;
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| IdentityError::Unavailable)?
    {
        if body.len() + chunk.len() > 65536 {
            return Err(IdentityError::Unavailable);
        }
        body.extend_from_slice(&chunk)
    }
    serde_json::from_slice(&body).map_err(|_| IdentityError::Unavailable)
}
#[async_trait::async_trait]
impl CustomerOAuth for CustomerOAuthClient {
    fn public_configuration(&self) -> serde_json::Value {
        self.providers
            .iter()
            .map(|(name, p)| {
                (
                    name.clone(),
                    serde_json::json!({"clientId":p.client_id,"callbackUrl":p.redirect_uri}),
                )
            })
            .collect::<serde_json::Map<String, serde_json::Value>>()
            .into()
    }
    fn configured(&self, config: serde_json::Value) -> IdentityResult<Arc<dyn CustomerOAuth>> {
        let mut providers: BTreeMap<String, Provider> = self
            .providers
            .iter()
            .map(|(k, p)| {
                (
                    k.clone(),
                    Provider {
                        client_id: p.client_id.clone(),
                        client_secret: p.client_secret.clone(),
                        redirect_uri: p.redirect_uri.clone(),
                    },
                )
            })
            .collect();
        for (key, value) in config.as_object().ok_or(IdentityError::Invalid)? {
            endpoints(key)?;
            let mut p: Provider =
                serde_json::from_value(value.clone()).map_err(|_| IdentityError::Invalid)?;
            if p.client_secret.expose_secret().is_empty() {
                p.client_secret = self
                    .providers
                    .get(key)
                    .ok_or(IdentityError::Invalid)?
                    .client_secret
                    .clone();
            }
            let uri = reqwest::Url::parse(&p.redirect_uri).map_err(|_| IdentityError::Invalid)?;
            if uri.scheme() != "https"
                || uri.host_str().is_none()
                || !uri.username().is_empty()
                || uri.password().is_some()
                || uri.query().is_some()
                || uri.fragment().is_some()
                || uri.path() != format!("/api/v1/auth/oauth/{key}/callback")
                || p.client_id.is_empty()
                || p.client_secret.expose_secret().is_empty()
            {
                return Err(IdentityError::Invalid);
            }
            providers.insert(key.clone(), p);
        }
        Ok(Arc::new(Self {
            providers,
            http: self.http.clone(),
        }))
    }
    fn providers(&self) -> Vec<String> {
        self.providers.keys().cloned().collect()
    }
    fn authorization_url(
        &self,
        provider: &str,
        state: &str,
        challenge: &str,
    ) -> IdentityResult<String> {
        let p = self
            .providers
            .get(provider)
            .ok_or(IdentityError::Unavailable)?;
        let (authorize, _, _, scope) = endpoints(provider)?;
        let mut url = reqwest::Url::parse(authorize).map_err(|_| IdentityError::Unavailable)?;
        url.query_pairs_mut()
            .append_pair("client_id", &p.client_id)
            .append_pair("redirect_uri", &p.redirect_uri)
            .append_pair("response_type", "code")
            .append_pair("scope", scope)
            .append_pair("state", state);
        if provider != "linuxdo" {
            url.query_pairs_mut()
                .append_pair("code_challenge", challenge)
                .append_pair("code_challenge_method", "S256");
        }
        Ok(url.to_string())
    }
    async fn exchange(
        &self,
        provider: &str,
        code: SecretString,
        verifier: SecretString,
    ) -> IdentityResult<ExternalSubject> {
        let p = self
            .providers
            .get(provider)
            .ok_or(IdentityError::Unavailable)?;
        let (_, token, user, _) = endpoints(provider)?;
        let mut form = vec![
            ("grant_type", "authorization_code"),
            ("client_id", p.client_id.as_str()),
            ("client_secret", p.client_secret.expose_secret()),
            ("redirect_uri", p.redirect_uri.as_str()),
            ("code", code.expose_secret()),
        ];
        if provider != "linuxdo" {
            form.push(("code_verifier", verifier.expose_secret()));
        }
        let token = json(
            self.http
                .post(token)
                .header("Accept", "application/json")
                .form(&form)
                .send()
                .await
                .map_err(|_| IdentityError::Unavailable)?,
        )
        .await?;
        let access = token
            .get("access_token")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or(IdentityError::Unauthorized)?;
        let user = json(
            self.http
                .get(user)
                .bearer_auth(access)
                .send()
                .await
                .map_err(|_| IdentityError::Unavailable)?,
        )
        .await?;
        if provider == "linuxdo"
            && (user.get("active").and_then(|v| v.as_bool()) != Some(true)
                || user.get("silenced").and_then(|v| v.as_bool()) == Some(true))
        {
            return Err(IdentityError::Forbidden);
        }
        let subject = match provider {
            "google" => user.get("sub").and_then(|v| v.as_str()).map(str::to_owned),
            _ => user
                .get("id")
                .and_then(|v| v.as_u64())
                .map(|v| v.to_string()),
        }
        .ok_or(IdentityError::Unauthorized)?;
        Ok(ExternalSubject {
            provider: provider.to_owned(),
            subject,
        })
    }
}
