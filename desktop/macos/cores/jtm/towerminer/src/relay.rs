// SPDX-License-Identifier: Apache-2.0
//! LAN relay (`--serve`): one Jetsam node for the machines of a home network.
//!
//! The machine that runs the node builds every block and proves the whole
//! history of the chain in it (the logbook proof, done by the logbook
//! prover). The other machines only search the nonce: they run towerminer
//! against this relay, and the relay talks to the node.
//!
//! The node keeps a single external-mining slot: while a template is live it
//! refuses a second attempt ("external mining attempt is already active").
//! The relay is its only client. It fetches the node's template, keeps it,
//! and serves it to every miner with a nonce region of its own (bits
//! 96..128, which towerminer already honours), so no two machines search the
//! same nonces. A solution goes to the node once per template; a second one
//! on a template already won is stale and never reaches the node.
//!
//! What the relay lets through, and nothing else:
//! - clients on the local network (private RFC 1918, link-local, loopback);
//!   the relay also refuses to listen on any other address;
//! - requests carrying the LAN key, which is not the node's key: the node's
//!   key stays on the node's machine and is never sent to a miner;
//! - `jetsam_getBlockTemplate` and `jetsam_submitBlock`, what towerminer
//!   calls. No wallet, chain or administration method ever passes.
//!
//! `--allow-public` lifts the address rules. The relay speaks plain HTTP: on
//! a public address the LAN key travels in clear.

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{IpAddr, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

use crate::status;

/// The only methods a miner may call through the relay: what towerminer
/// itself calls. Wallet, administration and chain methods never pass.
pub const ALLOWED_METHODS: [&str; 2] = ["jetsam_getBlockTemplate", "jetsam_submitBlock"];

/// Shortest LAN key accepted.
pub const LAN_KEY_MIN: usize = 16;

/// Seconds of life announced to a miner at most. towerminer polls every
/// 250 ms and each answer extends its search, so a short life costs nothing
/// while the relay serves, and bounds the work spent on a template the relay
/// stopped serving (a block found by another miner).
pub const SERVE_TTL_CAP: u64 = 10;

/// How often the relay asks the node for its template while it has one:
/// the node answers from its published work in microseconds, and a new tip
/// shows up as a new template within this delay.
const REFRESH: Duration = Duration::from_millis(500);
/// A template request answers once the node has built the block (the proof
/// runs after, while the miners search).
const NODE_TEMPLATE_TIMEOUT: Duration = Duration::from_secs(30);
/// One submit call: the node waits up to 30 s for its proof, then seals.
const NODE_SUBMIT_TIMEOUT: Duration = Duration::from_secs(75);
/// towerminer (0.3.1) gives a submission 120 s, 0.3.0 gave 45 s. Past this,
/// the relay closes the connection without an answer, so the miner counts
/// the block "unknown" rather than refused; the relay keeps going and
/// records the real outcome.
const MINER_SUBMIT_WAIT: Duration = Duration::from_secs(115);
/// After the life the node announced, a template stays served while the
/// node answers "already active" (its slot still takes solutions: it lives
/// 120 s from the end of the proof, the announced life 120 s from the
/// start), a few seconds at a time, and never longer than this after the
/// relay first saw it.
const SLOT_HOLD_STEP: Duration = Duration::from_secs(3);
const SLOT_HOLD_MAX: Duration = Duration::from_secs(240);
/// A miner is listed as active this long after its last request.
const ACTIVE_FOR: u64 = 120;
/// And forgotten after this.
const FORGET_AFTER: u64 = 3600;
const MAX_CONNECTIONS: usize = 256;
const MAX_HEADER_BYTES: usize = 16 * 1024;
const MAX_BODY_BYTES: usize = 64 * 1024;
const IDLE_TIMEOUT: Duration = Duration::from_secs(120);
/// Template ids remembered as served (a solution for another id is stale).
const SERVED_RING: usize = 32;
const EVENT_EVERY: Duration = Duration::from_secs(5);

pub fn method_allowed(method: &str) -> bool {
    ALLOWED_METHODS.contains(&method)
}

/// A local-network address: private (RFC 1918), link-local or loopback.
pub fn is_lan(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => v.is_private() || v.is_link_local() || v.is_loopback(),
        IpAddr::V6(v) => match v.to_ipv4_mapped() {
            Some(v4) => is_lan(IpAddr::V4(v4)),
            None => v.is_loopback() || (v.segments()[0] & 0xffc0) == 0xfe80,
        },
    }
}

/// The address the relay listens on: an IP literal and a port, on the local
/// network unless `allow_public`.
pub fn check_listen(s: &str, allow_public: bool) -> Result<SocketAddr, String> {
    let a: SocketAddr = s.trim().parse().map_err(|_| {
        format!("--serve {s}: expected IP:PORT, the address of this machine on your local network, for example 192.168.0.10:9702")
    })?;
    if allow_public {
        return Ok(a);
    }
    if a.ip().is_unspecified() {
        return Err(format!(
            "--serve {a}: {} listens on every interface, public ones included. Give this machine's address on your \
             local network instead, for example 192.168.0.10:{}",
            a.ip(),
            a.port()
        ));
    }
    if !is_lan(a.ip()) {
        return Err(format!(
            "--serve {a}: {} is not a local-network address (private 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, \
             link-local or loopback). The relay serves the machines of your own network only; --allow-public \
             overrides this at your own risk",
            a.ip()
        ));
    }
    Ok(a)
}

/// The LAN key miners present: long enough, printable, and never the node's
/// own key.
pub fn check_lan_key(lan: Option<&str>, node: Option<&str>) -> Result<String, String> {
    let k = lan.map(str::trim).filter(|k| !k.is_empty()).ok_or_else(|| {
        format!(
            "--serve needs a LAN key: --lan-key <KEY> or the TOWERMINER_LAN_KEY environment variable, at least \
             {LAN_KEY_MIN} characters. Your mining machines use it as their --key"
        )
    })?;
    if k.len() < LAN_KEY_MIN {
        return Err(format!("the LAN key must be at least {LAN_KEY_MIN} characters long"));
    }
    if !k.chars().all(|c| c.is_ascii_graphic()) {
        return Err("the LAN key must be printable ASCII, without spaces".into());
    }
    if node.map(str::trim) == Some(k) {
        return Err("the LAN key must differ from the node's mining key (--key): the node's key never leaves this machine".into());
    }
    Ok(k.to_string())
}

/// `Authorization` header value carries the LAN key, exactly.
pub fn bearer_ok(header: Option<&str>, lan_key: &str) -> bool {
    let want = format!("Bearer {lan_key}");
    let got = header.unwrap_or("").as_bytes();
    let want = want.as_bytes();
    // Constant time over the expected length: the answer does not tell how
    // many leading characters were right.
    let mut diff = (got.len() != want.len()) as u8;
    for (i, w) in want.iter().enumerate() {
        diff |= got.get(i).copied().unwrap_or(0) ^ w;
    }
    diff == 0
}

fn clean(s: &str, max: usize) -> String {
    s.chars().filter(|c| c.is_ascii_graphic() || *c == ' ').take(max).collect::<String>().trim().to_string()
}

/// What the relay knows about one miner.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Worker {
    /// `ip` or `ip/name`: two miners behind one address stay apart when
    /// they are named.
    pub id: String,
    pub name: Option<String>,
    pub ip: IpAddr,
    pub cpu: Option<String>,
    pub version: Option<String>,
    /// Hashes per second the miner reports (X-Jetsam-Hashrate).
    pub hps: Option<u64>,
    /// Unix time of the last request.
    pub last_seen: u64,
    pub jobs: u64,
    pub found: u64,
    pub accepted: u64,
    pub refused: u64,
    pub unknown: u64,
    /// Nonce region (bits 96..128) this miner searches.
    pub region: u32,
}

impl Worker {
    fn label(&self) -> String {
        match &self.name {
            Some(n) => format!("{n} ({})", self.ip),
            None => self.ip.to_string(),
        }
    }

    fn event(&self) -> Value {
        json!({
            "id": self.id,
            "name": self.name,
            "ip": self.ip.to_string(),
            "cpu": self.cpu,
            "version": self.version,
            "hps": self.hps,
            "last_seen": self.last_seen,
            "jobs": self.jobs,
            "found": self.found,
            "accepted": self.accepted,
            "refused": self.refused,
            "unknown": self.unknown,
            "region": self.region,
        })
    }
}

/// What a request says about the miner that sent it.
#[derive(Default)]
pub struct Seen<'a> {
    pub name: Option<&'a str>,
    pub cpu: Option<&'a str>,
    pub version: Option<&'a str>,
    pub hashrate: Option<&'a str>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    Accepted,
    Refused,
    Unknown,
}

/// Every miner seen, with its own nonce region.
pub struct Workers {
    map: BTreeMap<String, Worker>,
    next_region: u32,
}

impl Workers {
    /// `base`: the first region handed out (random per relay start).
    pub fn new(base: u32) -> Workers {
        Workers { map: BTreeMap::new(), next_region: base }
    }

    /// Record a request from a miner; returns its id.
    pub fn touch(&mut self, ip: IpAddr, seen: &Seen, now: u64) -> String {
        let name = seen.name.map(|n| clean(n, 32)).filter(|n| !n.is_empty());
        let id = match &name {
            Some(n) => format!("{ip}/{n}"),
            None => ip.to_string(),
        };
        if !self.map.contains_key(&id) {
            let region = self.next_region;
            self.next_region = self.next_region.wrapping_add(1);
            let w = Worker {
                id: id.clone(),
                name,
                ip,
                cpu: None,
                version: None,
                hps: None,
                last_seen: now,
                jobs: 0,
                found: 0,
                accepted: 0,
                refused: 0,
                unknown: 0,
                region,
            };
            self.map.insert(id.clone(), w);
        }
        let w = self.map.get_mut(&id).expect("just inserted");
        w.jobs += 1;
        w.last_seen = now;
        if let Some(c) = seen.cpu.map(|c| clean(c, 64)).filter(|c| !c.is_empty()) {
            w.cpu = Some(c);
        }
        if let Some(v) = seen.version.map(|v| clean(v, 32)).filter(|v| !v.is_empty()) {
            w.version = Some(v);
        }
        if let Some(h) = seen.hashrate {
            w.hps = h.trim().parse::<f64>().ok().filter(|h| h.is_finite() && *h > 0.0 && *h < 1e10).map(|h| h as u64);
        }
        self.map.retain(|_, w| now.saturating_sub(w.last_seen) <= FORGET_AFTER);
        id
    }

    pub fn get(&self, id: &str) -> Option<&Worker> {
        self.map.get(id)
    }

    /// A solution came in from this miner.
    pub fn found(&mut self, id: &str) {
        if let Some(w) = self.map.get_mut(id) {
            w.found += 1;
        }
    }

    /// The node's answer to that solution.
    pub fn outcome(&mut self, id: &str, o: Outcome) {
        if let Some(w) = self.map.get_mut(id) {
            match o {
                Outcome::Accepted => w.accepted += 1,
                Outcome::Refused => w.refused += 1,
                Outcome::Unknown => w.unknown += 1,
            }
        }
    }

    pub fn list(&self) -> Vec<Worker> {
        self.map.values().cloned().collect()
    }
}

/// The node's template as one miner receives it: its own nonce region, and a
/// life capped so that it comes back often for fresh work.
pub fn serve_template(tpl: &Value, region: u32, left: Duration) -> Value {
    let secs = left.as_secs().clamp(2, SERVE_TTL_CAP);
    let mut v = tpl.clone();
    v["nonce_prefix"] = json!(region);
    v["expires_in_seconds"] = json!(secs);
    v["ttl_remaining_ms"] = json!(secs * 1000);
    v
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

pub struct Config {
    pub listen: SocketAddr,
    /// The node's JSON-RPC URL (its --mode extminer endpoint).
    pub upstream: String,
    /// The node's --mining-key; None when the node runs without one.
    pub node_key: Option<String>,
    pub lan_key: String,
    pub allow_public: bool,
    pub report_every: Duration,
    pub version: &'static str,
}

struct Tpl {
    value: Value,
    id: String,
    height: u64,
    /// When the node will no longer take a solution for it (pessimistic).
    deadline: Instant,
    /// A block was accepted on it: the node consumed it.
    won: bool,
    first_seen: Instant,
}

#[derive(Default)]
struct Upstream {
    tpl: Option<Tpl>,
    /// The node's last refusal or transport error; None after a template.
    error: Option<String>,
    /// That error was no answer at all, or a bad key: a fault, not a wait.
    fault: bool,
    last_fetch: Option<Instant>,
    hold_until: Option<Instant>,
    /// Template ids served lately, with their height.
    served: VecDeque<(String, u64)>,
}

impl Upstream {
    fn live(&self, now: Instant) -> Option<&Tpl> {
        self.tpl.as_ref().filter(|t| !t.won && now < t.deadline)
    }
}

#[derive(Default)]
struct Slot {
    inflight: bool,
    /// (block hash, worker label) once a solution for it was accepted.
    won: Option<(String, String)>,
}

enum NodeErr {
    Transport(String),
    Answer(String, Value),
}

struct Relay {
    cfg: Config,
    up: Mutex<Upstream>,
    wake: Condvar,
    workers: Mutex<Workers>,
    slots: Mutex<HashMap<String, Slot>>,
    slots_cv: Condvar,
    found: AtomicU64,
    accepted: AtomicU64,
    refused: AtomicU64,
    unknown: AtomicU64,
    conns: AtomicUsize,
    node: reqwest::blocking::Client,
    node_submit: reqwest::blocking::Client,
    refused_ips: Mutex<HashMap<IpAddr, Instant>>,
}

/// The node's refusals, in words a miner can act on.
fn plain(msg: &str) -> &str {
    if msg.contains("already active") {
        "the node is still busy with an earlier template (its single mining slot frees itself within two minutes)"
    } else if msg.contains("waiting for network synchronization") {
        "the node is synchronizing with the network"
    } else {
        msg
    }
}

fn now_unix() -> u64 {
    status::unix_now()
}

fn rpc_error(id: &Value, code: i64, message: &str) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}})
}

/// What a request gets back: a JSON body with a status, or no answer at all.
enum Reply {
    Json(u16, Value),
    Drop,
}

impl Relay {
    fn node_call(&self, client: &reqwest::blocking::Client, method: &str, params: Value) -> Result<Value, NodeErr> {
        let mut rq = client
            .post(&self.cfg.upstream)
            .header("X-Jetsam-Version", format!("{} relay", self.cfg.version))
            .header("X-Jetsam-PoW", "walk")
            .json(&json!({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}));
        if let Some(k) = &self.cfg.node_key {
            rq = rq.header("Authorization", format!("Bearer {k}"));
        }
        let resp = rq.send().map_err(|e| NodeErr::Transport(format!("the node does not answer ({})", crate::err_chain(&e))))?;
        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(NodeErr::Answer(
                "the node refused the relay's key (401): --key must be the node's --mining-key".into(),
                Value::Null,
            ));
        }
        if !resp.status().is_success() {
            return Err(NodeErr::Answer(format!("HTTP {} from the node", resp.status()), Value::Null));
        }
        let body: Value = resp.json().map_err(|e| NodeErr::Answer(format!("unreadable answer from the node: {e}"), Value::Null))?;
        if let Some(e) = body.get("error").filter(|e| !e.is_null()) {
            let msg = e.get("message").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| e.to_string());
            return Err(NodeErr::Answer(msg, e.clone()));
        }
        match body.get("result") {
            Some(v) if !v.is_null() => Ok(v.clone()),
            _ => Err(NodeErr::Answer("the node returned no result".into(), Value::Null)),
        }
    }

    /// The node's template, fetched on its own thread: at most one request
    /// to the node at a time, whatever the number of miners.
    fn fetcher(self: Arc<Self>) {
        loop {
            {
                let mut up = self.up.lock().unwrap();
                loop {
                    let now = Instant::now();
                    let hold = up.hold_until.map(|h| h.saturating_duration_since(now)).unwrap_or_default();
                    let since = up.last_fetch.map(|t| now.duration_since(t)).unwrap_or(REFRESH);
                    let wait = if !hold.is_zero() {
                        hold
                    } else if up.live(now).is_some() {
                        REFRESH.saturating_sub(since)
                    } else {
                        // No work to serve: ask again at once, gently.
                        Duration::from_millis(250).saturating_sub(since)
                    };
                    if wait.is_zero() {
                        break;
                    }
                    up = self.wake.wait_timeout(up, wait.min(Duration::from_millis(250))).unwrap().0;
                }
            }
            let t0 = Instant::now();
            let r = self.node_call(&self.node, "jetsam_getBlockTemplate", json!([""]));
            let call = t0.elapsed();
            let mut up = self.up.lock().unwrap();
            let now = Instant::now();
            up.last_fetch = Some(now);
            match r {
                Ok(v) => {
                    let id = v.get("template_id").and_then(Value::as_str).unwrap_or("").to_string();
                    let height = v.get("height").and_then(Value::as_u64);
                    let (Some(height), false) = (height, id.is_empty() || id.len() > 64) else {
                        up.error = Some("the node sent a template the relay cannot read".into());
                        up.fault = true;
                        up.hold_until = Some(now + Duration::from_secs(1));
                        continue;
                    };
                    // `ttl_remaining_ms` is the life really left; the node
                    // counts it from before its proof, so the call time comes
                    // off (pessimistic: better ask early than serve dead work).
                    let ttl = v
                        .get("ttl_remaining_ms")
                        .and_then(Value::as_u64)
                        .map(Duration::from_millis)
                        .or_else(|| v.get("expires_in_seconds").and_then(Value::as_u64).map(Duration::from_secs))
                        .unwrap_or(Duration::from_secs(25));
                    let deadline = now + ttl.saturating_sub(call).max(Duration::from_secs(1));
                    let same = up.tpl.as_ref().is_some_and(|t| t.id == id);
                    if same {
                        let t = up.tpl.as_mut().unwrap();
                        t.value = v;
                        t.height = height;
                        t.deadline = deadline;
                    } else {
                        eprintln!("relay: new template h={height} tpl={id} (life {} s)", ttl.as_secs());
                        up.tpl = Some(Tpl { value: v, id: id.clone(), height, deadline, won: false, first_seen: now });
                        if !up.served.iter().any(|(i, _)| *i == id) {
                            up.served.push_back((id, height));
                            while up.served.len() > SERVED_RING {
                                up.served.pop_front();
                            }
                        }
                    }
                    up.error = None;
                    up.fault = false;
                    up.hold_until = None;
                }
                Err(NodeErr::Answer(msg, _)) => {
                    // "already active": the node is busy with its current
                    // template (proving it, or sealing a block found on it).
                    // It will not give another one before; asking faster only
                    // loads it.
                    let busy = msg.contains("already active");
                    if busy {
                        // The slot is still ours and still takes solutions:
                        // keep the machines on the template rather than idle.
                        if let Some(t) = up.tpl.as_mut().filter(|t| !t.won) {
                            let end = t.first_seen + SLOT_HOLD_MAX;
                            if now < end {
                                t.deadline = t.deadline.max((now + SLOT_HOLD_STEP).min(end));
                            }
                        }
                    }
                    up.fault = msg.contains("401") || msg.starts_with("HTTP ") || msg.starts_with("unreadable");
                    up.hold_until = Some(now + if busy { Duration::from_secs(1) } else { Duration::from_millis(500) });
                    if up.error.as_deref() != Some(msg.as_str()) {
                        eprintln!("relay: the node says: {msg}");
                    }
                    up.error = Some(msg);
                }
                Err(NodeErr::Transport(e)) => {
                    if up.error.as_deref() != Some(e.as_str()) {
                        eprintln!("relay: {e}");
                    }
                    up.error = Some(e);
                    up.fault = true;
                    up.hold_until = Some(now + Duration::from_secs(1));
                }
            }
        }
    }

    fn serve(&self, region: u32) -> Result<Value, String> {
        let up = self.up.lock().unwrap();
        let now = Instant::now();
        if let Some(t) = up.live(now) {
            return Ok(serve_template(&t.value, region, t.deadline - now));
        }
        Err(match &up.tpl {
            Some(t) if t.won => "no live template: a block was just found on the last one; waiting for the node's next template".into(),
            _ => format!("no live template: {}", up.error.as_deref().map(plain).unwrap_or("waiting for the node's template")),
        })
    }

    /// Whether the template is still the relay's current, unsolved and alive.
    fn tpl_alive(&self, tid: &str) -> bool {
        self.up.lock().unwrap().live(Instant::now()).is_some_and(|t| t.id == tid)
    }

    /// One solution, from receipt to the node's verdict, counted and logged
    /// whatever the path. Returns the block hash, the error object for the
    /// miner, or None when the node never answered.
    fn submit(self: &Arc<Self>, wid: &str, label: &str, tid: &str, nonce: &str) -> Result<String, Option<Value>> {
        let t0 = Instant::now();
        let (height, res, attempts) = self.submit_to_node(label, tid, nonce);
        let (outcome, result, hash, message) = match &res {
            Ok(h) => (Outcome::Accepted, "accepted", Some(h.clone()), String::new()),
            Err(Some(e)) => (Outcome::Refused, "refused", None, e.get("message").and_then(Value::as_str).unwrap_or("").to_string()),
            Err(None) => (Outcome::Unknown, "unknown", None, "the node did not answer".to_string()),
        };
        self.record(wid, outcome);
        let h = height.map(|h| h.to_string()).unwrap_or_else(|| "?".into());
        match &res {
            Ok(hash) => eprintln!(
                "relay: BLOCK ACCEPTED h={h} from {label}  hash={}…  ({} ms, {attempts} attempt{})",
                &hash[..hash.len().min(20)],
                t0.elapsed().as_millis(),
                if attempts == 1 { "" } else { "s" }
            ),
            Err(_) => eprintln!("relay: solution from {label} h={h} {result}: {message}"),
        }
        status::emit(json!({"type": "block", "ts": now_unix(), "height": height, "result": result, "hash": hash,
            "worker": label, "ip": wid.split('/').next().unwrap_or(""), "message": message}));
        res
    }

    /// (height of the template, verdict, attempts made at the node).
    fn submit_to_node(&self, label: &str, tid: &str, nonce: &str) -> (Option<u64>, Result<String, Option<Value>>, u32) {
        let stale = |m: String| Err(Some(json!({"code": -32010, "message": m})));
        let height = {
            let up = self.up.lock().unwrap();
            match up.served.iter().find(|(i, _)| i == tid) {
                Some((_, h)) => *h,
                None => return (None, stale("stale: this template is not one the relay served (expired or unknown)".into()), 0),
            }
        };
        // One submission per template reaches the node; the others wait for
        // its verdict. The node's template is single-use.
        {
            let mut slots = self.slots.lock().unwrap();
            let t0 = Instant::now();
            loop {
                let s = slots.entry(tid.to_string()).or_default();
                if let Some((hash, by)) = &s.won {
                    let m = format!("stale: this template was already solved by {by} (block {}…)", &hash[..hash.len().min(16)]);
                    return (Some(height), stale(m), 0);
                }
                if !s.inflight {
                    s.inflight = true;
                    break;
                }
                if t0.elapsed() > NODE_SUBMIT_TIMEOUT {
                    return (Some(height), stale("busy: another solution for this template is still with the node".into()), 0);
                }
                slots = self.slots_cv.wait_timeout(slots, Duration::from_millis(500)).unwrap().0;
            }
        }
        let t0 = Instant::now();
        let mut attempts = 0u32;
        let res: Result<String, Option<Value>> = loop {
            attempts += 1;
            match self.node_call(&self.node_submit, "jetsam_submitBlock", json!([tid, nonce])) {
                Ok(v) => break Ok(v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string())),
                Err(NodeErr::Transport(e)) => {
                    eprintln!("relay: submission from {label}: {e}; its fate is unknown");
                    break Err(None);
                }
                Err(NodeErr::Answer(msg, obj)) => {
                    let m = msg.to_ascii_lowercase();
                    let alive = self.tpl_alive(tid);
                    // The node waits up to 30 s for its proof, then says so:
                    // the solution is good, ask again while the template lives.
                    let retry = if m.contains("still being prepared") {
                        alive && t0.elapsed() < Duration::from_secs(110)
                    } else if m.contains("synchroniz") || m.contains("not ready") {
                        alive && t0.elapsed() < Duration::from_secs(20)
                    } else if m.contains("consumed") || m.contains("busy") {
                        // One string for four cases; only "busy" clears, and fast.
                        alive && attempts < 2
                    } else {
                        false
                    };
                    if !retry {
                        let waited = m.contains("still being prepared") || m.contains("synchroniz") || m.contains("not ready");
                        let obj = if waited && !alive {
                            // The node's wording ("retry") would mislead: the
                            // chain moved on while the node still proved it.
                            json!({"code": -32010, "message": format!(
                                "stale: a new block arrived while the node was still preparing this template ({msg})")})
                        } else if obj.is_null() {
                            json!({"code": -32000, "message": msg})
                        } else {
                            obj
                        };
                        break Err(Some(obj));
                    }
                    std::thread::sleep(Duration::from_millis(if m.contains("still being prepared") { 100 } else { 400 }));
                }
            }
        };
        {
            let mut slots = self.slots.lock().unwrap();
            if let Some(s) = slots.get_mut(tid) {
                s.inflight = false;
                if let Ok(hash) = &res {
                    s.won = Some((hash.clone(), label.to_string()));
                }
            }
            if slots.len() > 4 * SERVED_RING {
                let keep: Vec<String> = self.up.lock().unwrap().served.iter().map(|(i, _)| i.clone()).collect();
                slots.retain(|k, s| s.inflight || keep.contains(k));
            }
            self.slots_cv.notify_all();
        }
        if res.is_ok() {
            let mut up = self.up.lock().unwrap();
            if let Some(t) = up.tpl.as_mut().filter(|t| t.id == tid) {
                t.won = true;
            }
            up.hold_until = None;
            self.wake.notify_all();
        }
        (Some(height), res, attempts)
    }

    fn record(&self, wid: &str, o: Outcome) {
        self.workers.lock().unwrap().outcome(wid, o);
        match o {
            Outcome::Accepted => &self.accepted,
            Outcome::Refused => &self.refused,
            Outcome::Unknown => &self.unknown,
        }
        .fetch_add(1, Ordering::Relaxed);
    }

    /// One authenticated JSON-RPC request.
    fn handle(self: &Arc<Self>, req: &Request, peer: IpAddr) -> Reply {
        if req.method != "POST" {
            return Reply::Json(405, json!({"error": "the relay answers JSON-RPC POST requests only"}));
        }
        if !bearer_ok(req.header("authorization"), &self.cfg.lan_key) {
            return Reply::Json(401, json!({"error": "unauthorized: wrong or missing LAN key (the miner's --key)"}));
        }
        let Ok(body) = serde_json::from_slice::<Value>(&req.body) else {
            return Reply::Json(400, json!({"error": "bad JSON"}));
        };
        let id = body.get("id").cloned().unwrap_or(json!(1));
        let method = body.get("method").and_then(Value::as_str).unwrap_or("");
        if !method_allowed(method) {
            return Reply::Json(200, rpc_error(&id, -32601,
                "method not available through the relay (only jetsam_getBlockTemplate and jetsam_submitBlock)"));
        }
        let (wid, region, label) = {
            let mut w = self.workers.lock().unwrap();
            let wid = w.touch(
                peer,
                &Seen {
                    name: req.header("x-jetsam-host"),
                    cpu: req.header("x-jetsam-cpu"),
                    version: req.header("x-jetsam-version"),
                    hashrate: req.header("x-jetsam-hashrate"),
                },
                now_unix(),
            );
            let x = w.get(&wid).unwrap();
            (wid.clone(), x.region, x.label())
        };
        let params = body.get("params").cloned().unwrap_or(json!([]));
        if method == "jetsam_getBlockTemplate" {
            let coinbase = params.get(0).and_then(Value::as_str).unwrap_or("");
            if !coinbase.is_empty() {
                return Reply::Json(200, rpc_error(&id, -32602,
                    "the relay pays every block to the node's wallet: a payout address (--coinbase) is not relayed"));
            }
            return Reply::Json(200, match self.serve(region) {
                Ok(t) => json!({"jsonrpc": "2.0", "id": id, "result": t}),
                Err(msg) => rpc_error(&id, -32000, &msg),
            });
        }
        // jetsam_submitBlock
        self.workers.lock().unwrap().found(&wid);
        self.found.fetch_add(1, Ordering::Relaxed);
        let tid = params.get(0).and_then(Value::as_str).unwrap_or("").to_ascii_lowercase();
        let nonce = params.get(1).and_then(Value::as_str).unwrap_or("").to_ascii_lowercase();
        let hex = |s: &str| s.chars().all(|c| c.is_ascii_hexdigit());
        if tid.is_empty() || tid.len() > 64 || !hex(&tid) || nonce.len() != 32 || !hex(&nonce) {
            self.record(&wid, Outcome::Refused);
            return Reply::Json(200, rpc_error(&id, -32602, "invalid params: expected [template_id, 32 hex digits of nonce]"));
        }
        // The node can hold a solution for a while (its proof, then the
        // seal); the relay holds the miner as long as the miner waits, and
        // finishes the job on its own after that.
        let (tx, rx) = mpsc::channel();
        let me = self.clone();
        let (wid2, label2) = (wid.clone(), label.clone());
        std::thread::Builder::new()
            .name("relay-submit".into())
            .spawn(move || {
                let _ = tx.send(me.submit(&wid2, &label2, &tid, &nonce));
            })
            .expect("spawn relay-submit");
        match rx.recv_timeout(MINER_SUBMIT_WAIT) {
            Ok(Ok(hash)) => Reply::Json(200, json!({"jsonrpc": "2.0", "id": id, "result": hash})),
            Ok(Err(Some(e))) => Reply::Json(200, json!({"jsonrpc": "2.0", "id": id, "error": e})),
            Ok(Err(None)) => Reply::Drop,
            Err(_) => {
                eprintln!("relay: the solution from {label} is still with the node; the miner will count it unknown, the relay records the outcome");
                Reply::Drop
            }
        }
    }

    fn connection(self: Arc<Self>, stream: TcpStream, peer: SocketAddr) {
        let _ = stream.set_read_timeout(Some(IDLE_TIMEOUT));
        let _ = stream.set_write_timeout(Some(Duration::from_secs(20)));
        let _ = stream.set_nodelay(true);
        let Ok(mut w) = stream.try_clone() else { return };
        let mut r = BufReader::new(stream);
        loop {
            let req = match read_request(&mut r) {
                Ok(Some(q)) => q,
                Ok(None) => return,
                Err(e) => {
                    let _ = write_json(&mut w, 400, &json!({"error": e}), false);
                    return;
                }
            };
            let keep = req.keep_alive();
            match self.handle(&req, peer.ip()) {
                Reply::Json(code, v) => {
                    if write_json(&mut w, code, &v, keep).is_err() || !keep {
                        return;
                    }
                }
                Reply::Drop => return,
            }
        }
    }

    fn status_loop(self: Arc<Self>, started: Instant) {
        let mut next_event = Instant::now();
        let mut next_report = Instant::now() + self.cfg.report_every;
        loop {
            let now = Instant::now();
            if now >= next_event {
                next_event = now + EVENT_EVERY;
                let (ev, list) = self.snapshot(started);
                status::emit(ev);
                status::emit(json!({"type": "workers", "ts": now_unix(), "workers": list.iter().map(Worker::event).collect::<Vec<_>>()}));
            }
            if now >= next_report {
                next_report = now + self.cfg.report_every;
                self.report(started);
            }
            std::thread::sleep(Duration::from_millis(200));
        }
    }

    fn active(&self) -> Vec<Worker> {
        let t = now_unix();
        self.workers.lock().unwrap().list().into_iter().filter(|w| t.saturating_sub(w.last_seen) <= ACTIVE_FOR).collect()
    }

    fn snapshot(&self, started: Instant) -> (Value, Vec<Worker>) {
        let (state, message, height) = {
            let up = self.up.lock().unwrap();
            let now = Instant::now();
            let height = up.tpl.as_ref().map(|t| t.height);
            match (up.live(now), &up.error) {
                (Some(_), _) => ("serving", String::new(), height),
                (None, Some(e)) if up.fault => ("error", e.clone(), height),
                (None, Some(e)) => ("waiting", plain(e).to_string(), height),
                (None, None) if up.tpl.as_ref().is_some_and(|t| t.won) => {
                    ("waiting", "block found; waiting for the node's next template".into(), height)
                }
                (None, None) => ("waiting", "waiting for the node's template".into(), height),
            }
        };
        let active = self.active();
        let hps: u64 = active.iter().filter_map(|w| w.hps).sum();
        let all = self.workers.lock().unwrap().list();
        (
            json!({
                "type": "relay",
                "ts": now_unix(),
                "version": env!("CARGO_PKG_VERSION"),
                "listen": self.cfg.listen.to_string(),
                "upstream": self.cfg.upstream,
                "state": state,
                "message": message,
                "height": height,
                "workers": active.len(),
                "hps": hps,
                "found": self.found.load(Ordering::Relaxed),
                "accepted": self.accepted.load(Ordering::Relaxed),
                "refused": self.refused.load(Ordering::Relaxed),
                "unknown": self.unknown.load(Ordering::Relaxed),
                "uptime_s": started.elapsed().as_secs(),
            }),
            all,
        )
    }

    fn report(&self, started: Instant) {
        let (ev, list) = self.snapshot(started);
        eprintln!(
            "relay: {}{}  h={}  workers={}  {}  found={} accepted={} refused={} unknown={}",
            ev["state"].as_str().unwrap_or(""),
            match ev["message"].as_str() {
                Some(m) if !m.is_empty() => format!(" ({m})"),
                _ => String::new(),
            },
            ev["height"].as_u64().map(|h| h.to_string()).unwrap_or_else(|| "-".into()),
            ev["workers"],
            crate::fmt_rate(ev["hps"].as_u64().unwrap_or(0) as f64),
            ev["found"],
            ev["accepted"],
            ev["refused"],
            ev["unknown"],
        );
        let t = now_unix();
        for w in list {
            eprintln!(
                "relay:   {:<24} {:<26} {:>12}  seen {} s ago  found={} accepted={} refused={}{}",
                w.label(),
                w.cpu.as_deref().unwrap_or("-"),
                w.hps.map(|h| crate::fmt_rate(h as f64)).unwrap_or_else(|| "-".into()),
                t.saturating_sub(w.last_seen),
                w.found,
                w.accepted,
                w.refused,
                if w.unknown > 0 { format!(" unknown={}", w.unknown) } else { String::new() },
            );
        }
    }

    fn refuse_client(&self, mut s: TcpStream, ip: IpAddr) {
        {
            let mut seen = self.refused_ips.lock().unwrap();
            let fresh = seen.get(&ip).is_none_or(|t| t.elapsed() > Duration::from_secs(60));
            if fresh {
                eprintln!("relay: refused a connection from {ip}: not on the local network");
                seen.insert(ip, Instant::now());
                if seen.len() > 1024 {
                    seen.clear();
                }
            }
        }
        let _ = s.set_write_timeout(Some(Duration::from_secs(2)));
        let _ = write_json(&mut s, 403, &json!({"error": "the relay serves the local network only"}), false);
    }
}

/// Run the relay until Ctrl-C / SIGTERM. Never returns.
pub fn run(cfg: Config) -> ! {
    let listener = match TcpListener::bind(cfg.listen) {
        Ok(l) => l,
        Err(e) => status::exit_once(1, &format!("fatal: cannot listen on {}: {e}", cfg.listen)),
    };
    let build = |t: Duration| reqwest::blocking::Client::builder().timeout(t).build();
    let (Ok(node), Ok(node_submit)) = (build(NODE_TEMPLATE_TIMEOUT), build(NODE_SUBMIT_TIMEOUT)) else {
        status::exit_once(1, "fatal: cannot build the HTTP client");
    };
    let entropy = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().subsec_nanos();
    let base = entropy ^ (std::process::id() << 16);
    eprintln!(
        "relay: listening on {} for the miners of your local network{}",
        cfg.listen,
        if cfg.allow_public { " — --allow-public: ANY address may connect, the LAN key travels in clear" } else { "" }
    );
    eprintln!("relay: node {}  (node key: {})", cfg.upstream, if cfg.node_key.is_some() { "set" } else { "none" });
    eprintln!("relay: miners run  towerminer --rpc http://{} --key <the LAN key>", cfg.listen);
    let started = Instant::now();
    let relay = Arc::new(Relay {
        cfg,
        up: Mutex::new(Upstream::default()),
        wake: Condvar::new(),
        workers: Mutex::new(Workers::new(base)),
        slots: Mutex::new(HashMap::new()),
        slots_cv: Condvar::new(),
        found: AtomicU64::new(0),
        accepted: AtomicU64::new(0),
        refused: AtomicU64::new(0),
        unknown: AtomicU64::new(0),
        conns: AtomicUsize::new(0),
        node,
        node_submit,
        refused_ips: Mutex::new(HashMap::new()),
    });
    let r = relay.clone();
    std::thread::Builder::new().name("relay-fetch".into()).spawn(move || r.fetcher()).expect("spawn relay-fetch");
    let r = relay.clone();
    std::thread::Builder::new().name("relay-status".into()).spawn(move || r.status_loop(started)).expect("spawn relay-status");
    let r = relay.clone();
    std::thread::Builder::new()
        .name("relay-accept".into())
        .spawn(move || {
            for s in listener.incoming() {
                let Ok(s) = s else { continue };
                let Ok(peer) = s.peer_addr() else { continue };
                if !r.cfg.allow_public && !is_lan(peer.ip()) {
                    r.refuse_client(s, peer.ip());
                    continue;
                }
                if r.conns.fetch_add(1, Ordering::SeqCst) >= MAX_CONNECTIONS {
                    r.conns.fetch_sub(1, Ordering::SeqCst);
                    let mut s = s;
                    let _ = write_json(&mut s, 503, &json!({"error": "too many connections"}), false);
                    continue;
                }
                let r2 = r.clone();
                let spawned = std::thread::Builder::new().name("relay-conn".into()).spawn(move || {
                    r2.clone().connection(s, peer);
                    r2.conns.fetch_sub(1, Ordering::SeqCst);
                });
                if spawned.is_err() {
                    r.conns.fetch_sub(1, Ordering::SeqCst);
                }
            }
        })
        .expect("spawn relay-accept");
    crate::sys::install_stop_handler();
    loop {
        if crate::sys::stop_requested() {
            relay.report(started);
            status::exit_once(
                0,
                &format!(
                    "relay stopped after {} s: found={} accepted={} refused={} unknown={}",
                    started.elapsed().as_secs(),
                    relay.found.load(Ordering::Relaxed),
                    relay.accepted.load(Ordering::Relaxed),
                    relay.refused.load(Ordering::Relaxed),
                    relay.unknown.load(Ordering::Relaxed),
                ),
            );
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

// ---------------------------------------------------------------------------
// Minimal HTTP/1.1 (the miners' side): one JSON request, one JSON answer.
// ---------------------------------------------------------------------------

struct Request {
    method: String,
    version: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

impl Request {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
    }

    fn keep_alive(&self) -> bool {
        let c = self.header("connection").map(|c| c.to_ascii_lowercase());
        match c.as_deref() {
            Some(c) if c.contains("close") => false,
            Some(c) if c.contains("keep-alive") => true,
            _ => self.version == "HTTP/1.1",
        }
    }
}

/// One line, at most `left` bytes in total for the head.
fn read_line(r: &mut BufReader<TcpStream>, left: &mut usize) -> std::io::Result<Option<String>> {
    let mut buf = Vec::new();
    loop {
        let avail = r.fill_buf()?;
        if avail.is_empty() {
            return if buf.is_empty() { Ok(None) } else { Err(std::io::ErrorKind::UnexpectedEof.into()) };
        }
        let (take, done) = match avail.iter().position(|&b| b == b'\n') {
            Some(i) => (i + 1, true),
            None => (avail.len(), false),
        };
        if take > *left {
            return Err(std::io::Error::other("request head too large"));
        }
        *left -= take;
        buf.extend_from_slice(&avail[..take]);
        r.consume(take);
        if done {
            while matches!(buf.last(), Some(b'\n' | b'\r')) {
                buf.pop();
            }
            return Ok(Some(String::from_utf8_lossy(&buf).into_owned()));
        }
    }
}

/// Ok(None): the client closed the connection between requests.
fn read_request(r: &mut BufReader<TcpStream>) -> Result<Option<Request>, String> {
    let mut left = MAX_HEADER_BYTES;
    let line = match read_line(r, &mut left) {
        Ok(Some(l)) => l,
        Ok(None) => return Ok(None),
        Err(e) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => return Ok(None),
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    let mut parts = line.split_whitespace();
    let (Some(method), Some(_path), Some(version)) = (parts.next(), parts.next(), parts.next()) else {
        return Err("malformed request line".into());
    };
    let mut headers = Vec::new();
    loop {
        let h = read_line(r, &mut left).map_err(|e| e.to_string())?.ok_or("connection closed in the headers")?;
        if h.is_empty() {
            break;
        }
        if headers.len() >= 64 {
            return Err("too many headers".into());
        }
        let (k, v) = h.split_once(':').ok_or("malformed header")?;
        headers.push((k.trim().to_ascii_lowercase(), v.trim().to_string()));
    }
    let req_headers = Request { method: method.to_string(), version: version.to_string(), headers, body: Vec::new() };
    if req_headers.header("transfer-encoding").is_some() {
        return Err("chunked bodies are not supported; send Content-Length".into());
    }
    let len: usize = match req_headers.header("content-length") {
        Some(v) => v.trim().parse().map_err(|_| "bad Content-Length")?,
        None => 0,
    };
    if len > MAX_BODY_BYTES {
        return Err("request body too large".into());
    }
    let mut body = vec![0u8; len];
    r.read_exact(&mut body).map_err(|e| e.to_string())?;
    Ok(Some(Request { body, ..req_headers }))
}

fn write_json(w: &mut TcpStream, code: u16, v: &Value, keep: bool) -> std::io::Result<()> {
    let body = v.to_string();
    let reason = match code {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        405 => "Method Not Allowed",
        503 => "Service Unavailable",
        _ => "Error",
    };
    let head = format!(
        "HTTP/1.1 {code} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: {}\r\n{}\r\n",
        body.len(),
        if keep { "keep-alive" } else { "close" },
        if code == 401 { "WWW-Authenticate: Bearer realm=\"towerminer-relay\"\r\n" } else { "" }
    );
    w.write_all(head.as_bytes())?;
    w.write_all(body.as_bytes())?;
    w.flush()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    #[test]
    fn whitelist_is_the_two_mining_methods_only() {
        assert!(method_allowed("jetsam_getBlockTemplate"));
        assert!(method_allowed("jetsam_submitBlock"));
        for m in [
            "jetsam_walletSend",
            "jetsam_walletGetBalance",
            "jetsam_walletNextAddress",
            "jetsam_stop",
            "jetsam_getChainInfo",
            "jetsam_getMiningInfo",
            "jetsam_getNodeStatus",
            "jetsam_getblocktemplate",
            "getBlockTemplate",
            "",
        ] {
            assert!(!method_allowed(m), "{m} must not pass the relay");
        }
    }

    #[test]
    fn lan_means_private_link_local_or_loopback() {
        for a in [
            "10.0.0.1",
            "10.255.255.254",
            "172.16.0.1",
            "172.31.255.1",
            "192.168.0.10",
            "169.254.3.4",
            "127.0.0.1",
            "127.5.6.7",
            "::1",
            "fe80::1",
            "::ffff:192.168.0.20",
        ] {
            assert!(is_lan(ip(a)), "{a} is local");
        }
        for a in [
            "8.8.8.8",
            "172.15.255.255",
            "172.32.0.1",
            "100.64.0.1",
            "192.169.0.1",
            "11.0.0.1",
            "0.0.0.0",
            "255.255.255.255",
            "224.0.0.1",
            "2001:db8::1",
            "2a01:4f8::1",
            "::",
            "::ffff:8.8.8.8",
        ] {
            assert!(!is_lan(ip(a)), "{a} is not local");
        }
    }

    #[test]
    fn listen_refuses_public_and_unspecified_addresses() {
        assert_eq!(check_listen("192.168.0.10:9702", false).unwrap(), "192.168.0.10:9702".parse().unwrap());
        assert!(check_listen("127.0.0.1:9702", false).is_ok());
        let e = check_listen("8.8.8.8:9702", false).unwrap_err();
        assert!(e.contains("not a local-network address"), "{e}");
        let e = check_listen("0.0.0.0:9702", false).unwrap_err();
        assert!(e.contains("every interface"), "{e}");
        assert!(check_listen("[::]:9702", false).is_err());
        assert!(check_listen("my-host:9702", false).is_err(), "a host name is not an address");
        assert!(check_listen("192.168.0.10", false).is_err(), "the port is required");
        // The explicit override, and only it, lets a public address through.
        assert!(check_listen("8.8.8.8:9702", true).is_ok());
        assert!(check_listen("0.0.0.0:9702", true).is_ok());
    }

    #[test]
    fn lan_key_is_required_long_printable_and_not_the_node_key() {
        assert!(check_lan_key(None, Some("node-key-0123456789")).is_err());
        assert!(check_lan_key(Some("short"), None).is_err());
        assert!(check_lan_key(Some("has a space in it!!"), None).is_err());
        let e = check_lan_key(Some("same-key-0123456789"), Some("same-key-0123456789")).unwrap_err();
        assert!(e.contains("differ"), "{e}");
        assert_eq!(check_lan_key(Some("lan-key-0123456789"), Some("node-key-0123456789")).unwrap(), "lan-key-0123456789");
        assert!(check_lan_key(Some("lan-key-0123456789"), None).is_ok());
    }

    #[test]
    fn only_the_lan_key_opens_the_relay() {
        let lan = "lan-key-0123456789";
        assert!(bearer_ok(Some("Bearer lan-key-0123456789"), lan));
        assert!(!bearer_ok(None, lan));
        assert!(!bearer_ok(Some(""), lan));
        assert!(!bearer_ok(Some("lan-key-0123456789"), lan));
        assert!(!bearer_ok(Some("Bearer lan-key-012345678"), lan));
        assert!(!bearer_ok(Some("Bearer lan-key-01234567890"), lan));
        assert!(!bearer_ok(Some("Bearer node-key-0123456789"), lan), "the node's key is not the LAN key");
    }

    fn seen<'a>(name: Option<&'a str>) -> Seen<'a> {
        Seen { name, cpu: Some("Ryzen 9 5950X - 32t (2/core, 1 pads)"), version: Some("towerminer/0.3.1"), hashrate: Some("12345") }
    }

    #[test]
    fn every_miner_gets_its_own_nonce_region() {
        let mut w = Workers::new(7);
        let a = w.touch(ip("192.168.0.20"), &seen(None), 100);
        let b = w.touch(ip("192.168.0.21"), &seen(None), 100);
        let c = w.touch(ip("192.168.0.20"), &seen(Some("rig-2")), 100);
        let regions: Vec<u32> = [&a, &b, &c].iter().map(|id| w.get(id).unwrap().region).collect();
        assert_eq!(regions.len(), 3);
        assert!(regions[0] != regions[1] && regions[1] != regions[2] && regions[0] != regions[2], "{regions:?}");
        // The same miner keeps its region: its work carries on across polls.
        let a2 = w.touch(ip("192.168.0.20"), &seen(None), 105);
        assert_eq!(a2, a);
        assert_eq!(w.get(&a).unwrap().region, regions[0]);
        assert_eq!(w.get(&a).unwrap().jobs, 2);
        assert_eq!(w.get(&a).unwrap().last_seen, 105);
        assert_eq!(w.list().len(), 3);
    }

    #[test]
    fn a_worker_is_described_by_what_it_sends() {
        let mut w = Workers::new(0);
        let id = w.touch(ip("10.0.0.5"), &seen(Some("attic")), 42);
        let x = w.get(&id).unwrap();
        assert_eq!(x.name.as_deref(), Some("attic"));
        assert_eq!(x.ip, ip("10.0.0.5"));
        assert_eq!(x.cpu.as_deref(), Some("Ryzen 9 5950X - 32t (2/core, 1 pads)"));
        assert_eq!(x.version.as_deref(), Some("towerminer/0.3.1"));
        assert_eq!(x.hps, Some(12345));
        // An absurd or unreadable rate is not a rate.
        let id2 = w.touch(ip("10.0.0.6"), &Seen { hashrate: Some("lots"), ..Default::default() }, 42);
        assert_eq!(w.get(&id2).unwrap().hps, None);
        let id3 = w.touch(ip("10.0.0.7"), &Seen { hashrate: Some("99999999999999"), ..Default::default() }, 42);
        assert_eq!(w.get(&id3).unwrap().hps, None);
        // Header junk is cleaned: printable ASCII, 32 characters for a name.
        let id4 = w.touch(ip("10.0.0.8"), &Seen { name: Some("a\u{7}b<script>0123456789012345678901234567890"), ..Default::default() }, 42);
        let n = w.get(&id4).unwrap().name.clone().unwrap();
        assert!(n.len() <= 32 && n.chars().all(|c| c.is_ascii_graphic() || c == ' '), "{n:?}");
    }

    #[test]
    fn found_accepted_refused_are_counted_per_worker() {
        let mut w = Workers::new(0);
        let a = w.touch(ip("192.168.0.20"), &seen(Some("a")), 1);
        let b = w.touch(ip("192.168.0.21"), &seen(Some("b")), 1);
        w.found(&a);
        w.outcome(&a, Outcome::Accepted);
        w.found(&a);
        w.outcome(&a, Outcome::Refused);
        w.found(&b);
        w.outcome(&b, Outcome::Unknown);
        let (x, y) = (w.get(&a).unwrap(), w.get(&b).unwrap());
        assert_eq!((x.found, x.accepted, x.refused, x.unknown), (2, 1, 1, 0));
        assert_eq!((y.found, y.accepted, y.refused, y.unknown), (1, 0, 0, 1));
    }

    #[test]
    fn a_template_is_served_with_the_miners_region_and_a_short_life() {
        let tpl = serde_json::json!({
            "template_id": "00112233445566778899aabbccddeeff",
            "pow_fields_hex": "ab",
            "nonce_field_index": 20,
            "difficulty_target_hex": "ff",
            "height": 1234,
            "expires_in_seconds": 120,
            "ttl_remaining_ms": 118000,
            "pow_walk": true,
        });
        let v = serve_template(&tpl, 0xdead_beef, std::time::Duration::from_secs(90));
        assert_eq!(v["nonce_prefix"], 0xdead_beefu32);
        assert_eq!(v["expires_in_seconds"], SERVE_TTL_CAP);
        assert_eq!(v["ttl_remaining_ms"], SERVE_TTL_CAP * 1000);
        assert_eq!(v["template_id"], tpl["template_id"]);
        assert_eq!(v["height"], 1234);
        // Less than the cap left: the truth, never less than 2 s.
        let v = serve_template(&tpl, 1, std::time::Duration::from_millis(4500));
        assert_eq!(v["expires_in_seconds"], 4);
        let v = serve_template(&tpl, 1, std::time::Duration::from_millis(300));
        assert_eq!(v["expires_in_seconds"], 2);
        // The cached template itself is untouched (it is shared).
        assert!(tpl.get("nonce_prefix").is_none());
    }
}
