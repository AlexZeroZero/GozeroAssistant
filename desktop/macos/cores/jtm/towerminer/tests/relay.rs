// SPDX-License-Identifier: Apache-2.0
//! --serve, end to end on loopback: a stand-in node that records every call
//! it receives, the real towerminer binary as the relay, and miners played by
//! plain HTTP clients.
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

const NODE_KEY: &str = "node-key-SECRET-0123456789abcdef";
const LAN_KEY: &str = "lan-key-0123456789abcdef";
const TPL_ID: &str = "0102030405060708090a0b0c0d0e0f10";
const BLOCK_HASH: &str = "abababababababababababababababababababababababababababababababab";

/// One call the stand-in node received: (Authorization header, method, params).
type Seen = Arc<Mutex<Vec<(String, String, Value)>>>;

struct FakeNode {
    port: u16,
    seen: Seen,
}

/// A request's headers (lower-case names) and body.
type Http = (Vec<(String, String)>, Vec<u8>);

fn read_http(r: &mut BufReader<TcpStream>) -> Option<Http> {
    let mut line = String::new();
    if r.read_line(&mut line).ok()? == 0 {
        return None;
    }
    let mut headers = Vec::new();
    loop {
        let mut h = String::new();
        r.read_line(&mut h).ok()?;
        let h = h.trim_end().to_string();
        if h.is_empty() {
            break;
        }
        let (k, v) = h.split_once(':')?;
        headers.push((k.trim().to_ascii_lowercase(), v.trim().to_string()));
    }
    let len: usize = headers.iter().find(|(k, _)| k == "content-length").map(|(_, v)| v.parse().unwrap()).unwrap_or(0);
    let mut body = vec![0u8; len];
    r.read_exact(&mut body).ok()?;
    Some((headers, body))
}

fn template_json(state: &str, ttl_ms: u64) -> Value {
    json!({
        "template_id": TPL_ID,
        "pow_fields_hex": "00".repeat(21 * 16),
        "nonce_field_index": 20,
        "difficulty_target_hex": "ff".repeat(32),
        "height": 77,
        "expires_in_seconds": 120,
        "ttl_remaining_ms": ttl_ms,
        "n_txs": 1,
        "pow_walk": true,
        "miner_address": "tj1testpayoutaddress",
        "state": state,
    })
}

/// What the stand-in node answers to its n-th getBlockTemplate (1-based):
/// the result, or the error message.
type TemplateAnswer = fn(u32) -> Result<Value, String>;

/// A node in extminer mode, reduced to what the relay needs: one template,
/// the first submission accepted, every later one refused as consumed.
fn fake_node() -> FakeNode {
    fake_node_with(|_| Ok(template_json("ready", 110_000)))
}

fn fake_node_with(templates: TemplateAnswer) -> FakeNode {
    let l = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = l.local_addr().unwrap().port();
    let seen: Seen = Default::default();
    let s2 = seen.clone();
    let submits = Arc::new(Mutex::new(0u32));
    let fetches = Arc::new(Mutex::new(0u32));
    std::thread::spawn(move || {
        for c in l.incoming().flatten() {
            let (seen, submits, fetches) = (s2.clone(), submits.clone(), fetches.clone());
            std::thread::spawn(move || {
                let mut w = c.try_clone().unwrap();
                let mut r = BufReader::new(c);
                while let Some((headers, body)) = read_http(&mut r) {
                    let auth = headers.iter().find(|(k, _)| k == "authorization").map(|(_, v)| v.clone()).unwrap_or_default();
                    let req: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
                    let method = req["method"].as_str().unwrap_or("").to_string();
                    seen.lock().unwrap().push((auth.clone(), method.clone(), req["params"].clone()));
                    let answer = if auth != format!("Bearer {NODE_KEY}") {
                        json!({"jsonrpc": "2.0", "id": req["id"], "error": {"code": -32001, "message": "unauthorized"}})
                    } else {
                        match method.as_str() {
                            "jetsam_getBlockTemplate" => {
                                let mut n = fetches.lock().unwrap();
                                *n += 1;
                                match templates(*n) {
                                    Ok(t) => json!({"jsonrpc": "2.0", "id": req["id"], "result": t}),
                                    Err(m) => json!({"jsonrpc": "2.0", "id": req["id"], "error": {"code": -32000, "message": m}}),
                                }
                            }
                            "jetsam_submitBlock" => {
                                let mut n = submits.lock().unwrap();
                                *n += 1;
                                if *n == 1 {
                                    json!({"jsonrpc": "2.0", "id": req["id"], "result": BLOCK_HASH})
                                } else {
                                    json!({"jsonrpc": "2.0", "id": req["id"], "error": {"code": -32010,
                                        "message": "external mining template is unknown, expired, consumed, or busy"}})
                                }
                            }
                            // Anything else reaching the node is a leak.
                            _ => json!({"jsonrpc": "2.0", "id": req["id"], "result": "LEAKED"}),
                        }
                    };
                    let b = answer.to_string();
                    let resp = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{b}",
                        b.len()
                    );
                    if w.write_all(resp.as_bytes()).is_err() {
                        break;
                    }
                }
            });
        }
    });
    FakeNode { port, seen }
}

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
}

struct Relay {
    child: Child,
    url: String,
    out: Arc<Mutex<Vec<String>>>,
    err: Arc<Mutex<Vec<String>>>,
}

impl Drop for Relay {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn collect(stream: impl Read + Send + 'static) -> Arc<Mutex<Vec<String>>> {
    let lines: Arc<Mutex<Vec<String>>> = Default::default();
    let l2 = lines.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stream).lines().map_while(Result::ok) {
            l2.lock().unwrap().push(line);
        }
    });
    lines
}

fn relay(node: &FakeNode, lan_key: &str) -> Relay {
    let port = free_port();
    let mut child = Command::new(env!("CARGO_BIN_EXE_towerminer"))
        .args(["--serve", &format!("127.0.0.1:{port}"), "--rpc", &format!("http://127.0.0.1:{}", node.port), "--status-json"])
        .env("TOWERMINER_KEY", NODE_KEY)
        .env("TOWERMINER_LAN_KEY", lan_key)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let out = collect(child.stdout.take().unwrap());
    let err = collect(child.stderr.take().unwrap());
    Relay { child, url: format!("http://127.0.0.1:{port}"), out, err }
}

fn call(url: &str, key: Option<&str>, name: Option<&str>, method: &str, params: Value) -> (u16, String) {
    let c = reqwest::blocking::Client::builder().timeout(Duration::from_secs(60)).build().unwrap();
    let mut rq = c
        .post(url)
        .header("X-Jetsam-Version", "towerminer/test")
        .header("X-Jetsam-CPU", "Test CPU - 4t")
        .header("X-Jetsam-Hashrate", "1500")
        .json(&json!({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}));
    if let Some(k) = key {
        rq = rq.header("Authorization", format!("Bearer {k}"));
    }
    if let Some(n) = name {
        rq = rq.header("X-Jetsam-Host", n);
    }
    match rq.send() {
        Ok(r) => {
            let code = r.status().as_u16();
            (code, r.text().unwrap_or_default())
        }
        Err(e) => (0, format!("transport: {e}")),
    }
}

/// Poll until the relay serves work (it fetches the node's template on its own).
fn template(url: &str, name: &str) -> Value {
    let t0 = Instant::now();
    loop {
        let (code, body) = call(url, Some(LAN_KEY), Some(name), "jetsam_getBlockTemplate", json!([""]));
        if code == 200 {
            let v: Value = serde_json::from_str(&body).unwrap();
            if v.get("result").is_some() {
                return v;
            }
        }
        assert!(t0.elapsed() < Duration::from_secs(20), "no template from the relay: {code} {body}");
        std::thread::sleep(Duration::from_millis(100));
    }
}

fn last_event(lines: &Arc<Mutex<Vec<String>>>, kind: &str) -> Option<Value> {
    lines
        .lock()
        .unwrap()
        .iter()
        .rev()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .find(|v| v["type"] == kind)
}

#[test]
fn two_miners_get_distinct_regions_and_never_see_the_node_key() {
    let node = fake_node();
    let r = relay(&node, LAN_KEY);
    let a = template(&r.url, "alpha");
    let b = template(&r.url, "beta");
    for v in [&a, &b] {
        assert_eq!(v["result"]["template_id"], TPL_ID);
        assert_eq!(v["result"]["height"], 77);
        assert!(v["result"]["expires_in_seconds"].as_u64().unwrap() <= 10);
    }
    let (ra, rb) = (a["result"]["nonce_prefix"].as_u64().unwrap(), b["result"]["nonce_prefix"].as_u64().unwrap());
    assert_ne!(ra, rb, "two miners, two nonce regions");
    // The same miner keeps its region.
    assert_eq!(template(&r.url, "alpha")["result"]["nonce_prefix"].as_u64().unwrap(), ra);

    // The node saw the node key, never the LAN key; the miners never saw the node key.
    for (auth, _, _) in node.seen.lock().unwrap().iter() {
        assert_eq!(auth, &format!("Bearer {NODE_KEY}"));
    }
    for v in [&a, &b] {
        assert!(!v.to_string().contains(NODE_KEY));
    }
    // Neither in the relay's own output.
    std::thread::sleep(Duration::from_secs(6));
    for l in r.out.lock().unwrap().iter().chain(r.err.lock().unwrap().iter()) {
        assert!(!l.contains(NODE_KEY), "node key in the relay's output: {l}");
        assert!(!l.contains(LAN_KEY), "LAN key in the relay's output: {l}");
    }
}

#[test]
fn wrong_or_missing_key_is_refused_and_the_node_key_does_not_open_the_relay() {
    let node = fake_node();
    let r = relay(&node, LAN_KEY);
    template(&r.url, "alpha");
    let before = node.seen.lock().unwrap().len();
    for key in [None, Some("wrong-key-0123456789"), Some(NODE_KEY)] {
        let (code, body) = call(&r.url, key, Some("mallory"), "jetsam_getBlockTemplate", json!([""]));
        assert_eq!(code, 401, "{key:?}: {body}");
        let (code, _) = call(&r.url, key, Some("mallory"), "jetsam_submitBlock", json!([TPL_ID, "00".repeat(16)]));
        assert_eq!(code, 401);
    }
    // No submission reached the node.
    assert!(node.seen.lock().unwrap()[before..].iter().all(|(_, m, _)| m == "jetsam_getBlockTemplate"));
}

#[test]
fn only_the_mining_methods_pass_the_relay() {
    let node = fake_node();
    let r = relay(&node, LAN_KEY);
    template(&r.url, "alpha");
    for m in ["jetsam_walletSend", "jetsam_walletGetBalance", "jetsam_stop", "jetsam_getChainInfo", "jetsam_getMiningInfo", "jetsam_walletExportSecret"] {
        let (code, body) = call(&r.url, Some(LAN_KEY), Some("alpha"), m, json!([]));
        assert_eq!(code, 200, "{m}");
        let v: Value = serde_json::from_str(&body).unwrap();
        assert!(v.get("result").is_none(), "{m} answered: {body}");
        assert_eq!(v["error"]["code"], -32601, "{m}: {body}");
    }
    // A payout address of the miner's choosing is not relayed either: blocks
    // pay the node's wallet.
    let (_, body) = call(&r.url, Some(LAN_KEY), Some("alpha"), "jetsam_getBlockTemplate", json!(["tj1someoneelse"]));
    assert!(body.contains("error"), "{body}");
    let methods: Vec<String> = node.seen.lock().unwrap().iter().map(|(_, m, _)| m.clone()).collect();
    assert!(methods.iter().all(|m| m == "jetsam_getBlockTemplate"), "the node was called with {methods:?}");
    assert!(node.seen.lock().unwrap().iter().all(|(_, _, p)| p == &json!([""])), "only the node's own payout");
}

#[test]
fn solutions_are_forwarded_once_per_template_and_counted_per_worker() {
    let node = fake_node();
    let r = relay(&node, LAN_KEY);
    template(&r.url, "alpha");
    template(&r.url, "beta");
    let nonce_a = "11".repeat(16);
    let nonce_b = "22".repeat(16);
    let (code, body) = call(&r.url, Some(LAN_KEY), Some("alpha"), "jetsam_submitBlock", json!([TPL_ID, nonce_a]));
    assert_eq!(code, 200);
    assert_eq!(serde_json::from_str::<Value>(&body).unwrap()["result"], BLOCK_HASH, "{body}");
    // beta finds a solution on the template alpha already won: stale, and
    // never sent to the node (it would destroy nothing but costs a call).
    let (_, body) = call(&r.url, Some(LAN_KEY), Some("beta"), "jetsam_submitBlock", json!([TPL_ID, nonce_b]));
    let v: Value = serde_json::from_str(&body).unwrap();
    assert!(v.get("result").is_none(), "{body}");
    assert!(v["error"]["message"].as_str().unwrap().contains("stale"), "{body}");
    // A solution for a template the relay never served is refused as stale.
    let (_, body) = call(&r.url, Some(LAN_KEY), Some("beta"), "jetsam_submitBlock", json!(["ffffffffffffffffffffffffffffffff", nonce_b]));
    assert!(body.contains("stale"), "{body}");
    // Malformed nonce: refused by the relay.
    let (_, body) = call(&r.url, Some(LAN_KEY), Some("beta"), "jetsam_submitBlock", json!([TPL_ID, "xyz"]));
    assert!(body.contains("error"), "{body}");
    let submits: Vec<Value> =
        node.seen.lock().unwrap().iter().filter(|(_, m, _)| m == "jetsam_submitBlock").map(|(_, _, p)| p.clone()).collect();
    assert_eq!(submits, vec![json!([TPL_ID, nonce_a])], "exactly one submission reached the node");

    // The block won makes the template dead for everybody.
    let (_, body) = call(&r.url, Some(LAN_KEY), Some("beta"), "jetsam_getBlockTemplate", json!([""]));
    // (the stand-in node keeps answering the same template id: the relay does
    // not serve a template it knows is consumed)
    assert!(body.contains("error"), "{body}");

    // Per-worker figures in --status-json.
    let t0 = Instant::now();
    let workers = loop {
        if let Some(w) = last_event(&r.out, "workers") {
            let list = w["workers"].as_array().unwrap().clone();
            if list.iter().any(|x| x["found"].as_u64() == Some(3)) {
                break list;
            }
        }
        assert!(t0.elapsed() < Duration::from_secs(12), "no workers event with the counts: {:?}", r.out.lock().unwrap());
        std::thread::sleep(Duration::from_millis(200));
    };
    let by = |n: &str| workers.iter().find(|x| x["name"] == n).unwrap_or_else(|| panic!("{n} missing from {workers:?}")).clone();
    let (a, b) = (by("alpha"), by("beta"));
    assert_eq!((a["found"].as_u64(), a["accepted"].as_u64(), a["refused"].as_u64()), (Some(1), Some(1), Some(0)), "{a}");
    assert_eq!((b["found"].as_u64(), b["accepted"].as_u64(), b["refused"].as_u64()), (Some(3), Some(0), Some(3)), "{b}");
    assert_eq!(a["ip"], "127.0.0.1");
    assert_eq!(a["cpu"], "Test CPU - 4t");
    assert_eq!(a["hps"], 1500);
    assert!(a["last_seen"].as_u64().unwrap() > 1_700_000_000);
    assert_ne!(a["region"], b["region"]);
    let relay_ev = last_event(&r.out, "relay").expect("relay event");
    assert_eq!(relay_ev["accepted"], 1);
    assert_eq!(relay_ev["workers"], 2);
    let block = last_event(&r.out, "block").expect("block event");
    assert!(block["worker"].is_string());
}

fn refused_start(args: &[&str], lan: Option<&str>, node_key: Option<&str>) -> (i32, String, String) {
    let mut c = Command::new(env!("CARGO_BIN_EXE_towerminer"));
    c.args(args).args(["--status-json"]).env_remove("TOWERMINER_KEY").env_remove("TOWERMINER_LAN_KEY");
    if let Some(k) = lan {
        c.env("TOWERMINER_LAN_KEY", k);
    }
    if let Some(k) = node_key {
        c.env("TOWERMINER_KEY", k);
    }
    let out = c.output().unwrap();
    (out.status.code().unwrap_or(-1), String::from_utf8_lossy(&out.stdout).into_owned(), String::from_utf8_lossy(&out.stderr).into_owned())
}

#[test]
fn the_relay_refuses_to_start_on_a_public_address_or_without_a_proper_lan_key() {
    let (code, out, err) = refused_start(&["--serve", "8.8.8.8:9702"], Some(LAN_KEY), Some(NODE_KEY));
    assert_eq!(code, 2, "{err}");
    assert!(err.contains("not a local-network address"), "{err}");
    assert!(out.contains("\"type\":\"error\""), "{out}");
    let (code, _, err) = refused_start(&["--serve", "0.0.0.0:9702"], Some(LAN_KEY), Some(NODE_KEY));
    assert_eq!(code, 2, "{err}");
    let (code, _, err) = refused_start(&["--serve", "127.0.0.1:9702"], None, Some(NODE_KEY));
    assert_eq!(code, 2, "{err}");
    assert!(err.contains("--lan-key"), "{err}");
    let (code, _, err) = refused_start(&["--serve", "127.0.0.1:9702"], Some(NODE_KEY), Some(NODE_KEY));
    assert_eq!(code, 2, "{err}");
    assert!(!err.contains(NODE_KEY), "the key itself is never printed: {err}");
}

/// The node's published work (the preview) lives 120 s from its publication,
/// its submittable slot 120 s from the end of its proof. Between the two it
/// answers "already active" to a template request and still takes solutions:
/// the relay keeps serving the template it holds, rather than leave every
/// machine idle until the slot frees.
#[test]
fn the_template_is_served_while_the_node_says_its_slot_is_still_active() {
    let node = fake_node_with(|n| match n {
        1 => Ok(template_json("preview", 1500)),
        _ => Err("external mining attempt is already active".into()),
    });
    let r = relay(&node, LAN_KEY);
    template(&r.url, "alpha");
    std::thread::sleep(Duration::from_secs(4));
    let (_, body) = call(&r.url, Some(LAN_KEY), Some("alpha"), "jetsam_getBlockTemplate", json!([""]));
    let v: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(v["result"]["template_id"], TPL_ID, "still served past the preview's life: {body}");
    assert!(v["result"]["expires_in_seconds"].as_u64().unwrap() <= 3, "{body}");
}

/// Any other answer says nothing about the slot: the template stops at the
/// life the node announced.
#[test]
fn a_template_is_not_served_past_its_life_on_any_other_answer() {
    let node = fake_node_with(|n| match n {
        1 => Ok(template_json("preview", 1500)),
        _ => Err("mining is waiting for network synchronization".into()),
    });
    let r = relay(&node, LAN_KEY);
    template(&r.url, "alpha");
    std::thread::sleep(Duration::from_secs(4));
    let (_, body) = call(&r.url, Some(LAN_KEY), Some("alpha"), "jetsam_getBlockTemplate", json!([""]));
    assert!(body.contains("no live template"), "{body}");
    assert!(body.contains("synchroniz"), "{body}");
}
