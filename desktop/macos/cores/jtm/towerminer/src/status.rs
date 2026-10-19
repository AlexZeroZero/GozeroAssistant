// SPDX-License-Identifier: Apache-2.0
//! Machine-readable status (`--status-json`: one JSON object per line on
//! stdout, flushed at every line), the single exit path, and terminal
//! colours.
//!
//! Events (the contract front ends rely on; fields are never renamed):
//!
//! - `{"type":"profile","version","backend","cpu","threads","tpc","pads","prefetch","kernel","pages"}`
//! - `{"type":"status","ts","hps","height","found","accepted","refused","unknown","uptime_s","state","message"}`
//!   every 5 s; `state` is `mining`, `waiting` or `error`
//! - `{"type":"block","ts","height","result","hash"}` for every submitted solution;
//!   `result` is `accepted`, `refused` or `unknown`
//! - `{"type":"error","message"}` before any exit with a non-zero code
use std::io::{IsTerminal, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

static JSON: AtomicBool = AtomicBool::new(false);
static EXITING: AtomicBool = AtomicBool::new(false);

pub fn enable_json() {
    JSON.store(true, Ordering::SeqCst);
}

pub fn json_on() -> bool {
    JSON.load(Ordering::Relaxed)
}

/// Write one event line on stdout (only with --status-json).
pub fn emit(v: serde_json::Value) {
    if !json_on() {
        return;
    }
    let line = v.to_string();
    let out = std::io::stdout();
    let mut l = out.lock();
    let _ = writeln!(l, "{line}");
    let _ = l.flush();
}

pub fn unix_now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Exit exactly once, whichever thread gets here first; any other thread that
/// races it parks for good instead of running exit handlers concurrently. A
/// non-zero exit is announced as an `error` event first.
pub fn exit_once(code: i32, msg: &str) -> ! {
    if EXITING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
        if !msg.is_empty() {
            eprintln!("{msg}");
        }
        if code != 0 {
            emit(serde_json::json!({"type": "error", "message": strip_ansi(msg)}));
        }
        std::process::exit(code);
    }
    loop {
        std::thread::park();
    }
}

/// Colours only on a terminal that understands them.
pub fn color() -> bool {
    static C: OnceLock<bool> = OnceLock::new();
    *C.get_or_init(|| std::io::stderr().is_terminal() && crate::sys::enable_ansi())
}

pub fn red(s: &str) -> String {
    if color() {
        format!("\x1b[31m{s}\x1b[0m")
    } else {
        s.to_string()
    }
}

/// `s` without ANSI CSI sequences.
pub fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut it = s.chars().peekable();
    while let Some(c) = it.next() {
        if c == '\x1b' && it.peek() == Some(&'[') {
            it.next();
            for d in it.by_ref() {
                if d.is_ascii_alphabetic() {
                    break;
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_ansi_removes_colour_codes_only() {
        assert_eq!(strip_ansi("\x1b[31mTHERMAL: 81 C\x1b[0m done"), "THERMAL: 81 C done");
        assert_eq!(strip_ansi("plain"), "plain");
    }
}
