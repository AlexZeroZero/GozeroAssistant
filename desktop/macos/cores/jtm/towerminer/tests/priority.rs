// SPDX-License-Identifier: Apache-2.0
//! --priority, end to end on Linux: run a short --check-nonces and read the
//! real nice value of every thread of the process from /proc.
#![cfg(target_os = "linux")]

use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Nice value of a task from its /proc stat line (field 19; the command name
/// in parentheses may contain spaces).
fn nice_of(stat: &str) -> Option<i32> {
    let rest = &stat[stat.rfind(')')? + 1..];
    rest.split_whitespace().nth(16)?.parse().ok()
}

fn own_nice() -> i32 {
    nice_of(&std::fs::read_to_string("/proc/self/stat").unwrap()).unwrap()
}

/// Run `--check-nonces 4` with `extra`, sample the nice value of every thread
/// while it runs; return (nice values seen, most threads seen at once, stderr).
fn run(extra: &[&str]) -> (Vec<i32>, usize, String) {
    let mut args = vec!["--no-tune-file", "--threads", "4", "--check-nonces", "4"];
    if cfg!(feature = "fleet") {
        args.push("--no-thermal-guard");
    }
    args.extend_from_slice(extra);
    let mut child = Command::new(env!("CARGO_BIN_EXE_towerminer"))
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let dir = format!("/proc/{}/task", child.id());
    let (mut seen, mut most) = (Vec::<i32>::new(), 0);
    let t0 = Instant::now();
    while child.try_wait().unwrap().is_none() && t0.elapsed() < Duration::from_secs(120) {
        // A sample with a single task can predate main() itself (the
        // priority is set there): only samples where threads exist count.
        if let Ok(rd) = std::fs::read_dir(&dir) {
            let tasks: Vec<i32> = rd
                .flatten()
                .filter_map(|e| std::fs::read_to_string(e.path().join("stat")).ok().as_deref().and_then(nice_of))
                .collect();
            if tasks.len() > 1 {
                most = most.max(tasks.len());
                seen.extend(tasks);
            }
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let out = child.wait_with_output().unwrap();
    assert!(out.status.success(), "check-nonces failed: {}", String::from_utf8_lossy(&out.stderr));
    (seen, most, String::from_utf8_lossy(&out.stderr).into_owned())
}

#[test]
fn nice_of_parses_proc_stat() {
    let s = "1234 (tower miner) S 1 1234 1234 0 -1 4194560 100 0 0 0 5 1 0 0 39 19 5 0 100 0 0";
    assert_eq!(nice_of(s), Some(19));
}

#[test]
fn default_priority_is_nice_19_on_every_thread() {
    let (seen, most, err) = run(&[]);
    assert!(err.contains("priority: low (nice 19)"), "no priority line in:\n{err}");
    assert!(most > 1, "worker threads never seen (at most {most} task)");
    assert!(seen.iter().all(|&n| n == 19), "nice values seen: {seen:?}");
}

#[test]
fn priority_normal_leaves_nice_unchanged() {
    let want = own_nice();
    let (seen, most, err) = run(&["--priority", "normal"]);
    assert!(err.contains("priority: normal"), "no priority line in:\n{err}");
    assert!(most > 1, "worker threads never seen (at most {most} task)");
    assert!(seen.iter().all(|&n| n == want), "nice values seen: {seen:?}, want {want}");
}
