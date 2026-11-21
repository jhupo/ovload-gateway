// Modified for Ovload on 2026-10-27: workspace integration.

//! 网关命令行入口，选择启动模式并创建异步运行时

use std::{
    env,
    error::Error,
    io::{self, Read, Write},
    process::ExitCode,
};

use provider_openai::ensure_rustls_provider;

fn main() -> ExitCode {
    match run() {
        Ok(code) => code,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<ExitCode, Box<dyn Error + Send + Sync>> {
    ensure_rustls_provider();
    let mut arguments = env::args_os().skip(1);
    let command = arguments
        .next()
        .map(|value| {
            value
                .into_string()
                .map_err(|_| invalid_cli("command must be UTF-8"))
        })
        .transpose()?;
    match command.as_deref() {
        None | Some("serve") => {
            reject_extra_arguments(arguments)?;
            runtime()?.block_on(ovload_gateway::bootstrap::run())?;
            Ok(ExitCode::SUCCESS)
        }
        Some("help" | "--help" | "-h") => {
            reject_extra_arguments(arguments)?;
            println!(
                "Usage: ovload-gateway [serve]\n       ovload-gateway plugin <instance-id> <command> [options]\n       ovload-gateway identity <bootstrap-owner|provision-operator> <username> --password-file <path>\n\n  --help     Show help without loading configuration\n  --version  Show version\n  plugin --help  List enabled plugin commands without starting HTTP"
            );
            Ok(ExitCode::SUCCESS)
        }
        Some("--version" | "-V") => {
            reject_extra_arguments(arguments)?;
            println!(
                "{}",
                option_env!("CPR_VERSION").unwrap_or(env!("CARGO_PKG_VERSION"))
            );
            Ok(ExitCode::SUCCESS)
        }
        Some("identity") => {
            let operation = arguments.next().and_then(|value| value.into_string().ok());
            if !matches!(
                operation.as_deref(),
                Some("bootstrap-owner" | "provision-operator")
            ) {
                return Err(invalid_cli(
                    "expected identity <bootstrap-owner|provision-operator> <username> --password-file <path>",
                )
                .into());
            }
            let username = arguments
                .next()
                .and_then(|value| value.into_string().ok())
                .ok_or_else(|| invalid_cli("identity username must be UTF-8"))?;
            if arguments.next().as_deref() != Some(std::ffi::OsStr::new("--password-file")) {
                return Err(invalid_cli("identity bootstrap requires --password-file; plaintext arguments are not accepted").into());
            }
            let path = arguments
                .next()
                .ok_or_else(|| invalid_cli("missing password file"))?;
            reject_extra_arguments(arguments)?;
            let mut bytes = Vec::new();
            std::fs::File::open(path)?
                .take(259)
                .read_to_end(&mut bytes)?;
            if bytes.len() > 258 {
                return Err(invalid_cli(
                    "password file exceeds 256 UTF-8 bytes plus an optional line ending",
                )
                .into());
            }
            if bytes.last() == Some(&b'\n') {
                bytes.pop();
                if bytes.last() == Some(&b'\r') {
                    bytes.pop();
                }
            }
            let password =
                String::from_utf8(bytes).map_err(|_| invalid_cli("password file must be UTF-8"))?;
            let principal = if operation.as_deref() == Some("bootstrap-owner") {
                runtime()?.block_on(ovload_gateway::bootstrap::bootstrap_identity_owner(
                    username, password,
                ))?
            } else {
                runtime()?.block_on(ovload_gateway::bootstrap::provision_identity_operator(
                    username, password,
                ))?
            };
            println!("Created management principal {principal}");
            Ok(ExitCode::SUCCESS)
        }
        Some("plugin") => {
            let arguments = arguments
                .map(|value| {
                    value
                        .into_string()
                        .map_err(|_| invalid_cli("plugin arguments must be UTF-8"))
                })
                .collect::<Result<Vec<_>, _>>()?;
            let mut arguments = arguments.into_iter();
            let instance_id = arguments
                .next()
                .filter(|value| !matches!(value.as_str(), "--help" | "-h"));
            let name = arguments
                .next()
                .filter(|value| !matches!(value.as_str(), "--help" | "-h"));
            if instance_id.is_none() && name.is_some() {
                return Err(invalid_cli("unexpected plugin help arguments").into());
            }
            let output = runtime()?.block_on(ovload_gateway::bootstrap::plugin_command(
                ovload_gateway::bootstrap::PluginCommand {
                    instance_id,
                    name,
                    arguments: arguments.collect(),
                },
            ))?;
            io::stdout().lock().write_all(output.stdout.as_bytes())?;
            io::stderr().lock().write_all(output.stderr.as_bytes())?;
            Ok(ExitCode::from(output.exit_code))
        }
        Some(_) => {
            Err(invalid_cli("unknown command; expected serve, plugin, identity, or --help").into())
        }
    }
}

fn runtime() -> Result<tokio::runtime::Runtime, io::Error> {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
}

fn reject_extra_arguments(mut arguments: impl Iterator) -> Result<(), io::Error> {
    if arguments.next().is_some() {
        return Err(invalid_cli("unexpected extra command arguments"));
    }
    Ok(())
}

fn invalid_cli(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}
