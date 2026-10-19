// SPDX-License-Identifier: Apache-2.0
//! No package-energy counter outside Linux: --bench-walk and --tune report
//! power as n/a.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {}

impl Mode {
    pub fn name(self) -> &'static str {
        match self {}
    }
}

pub struct Rapl {
    pub mode: Mode,
}

#[derive(Debug, Clone)]
pub struct Sample;

impl Rapl {
    pub fn open() -> Option<Rapl> {
        None
    }

    pub fn sample(&self) -> Option<Sample> {
        match self.mode {}
    }

    pub fn watts(&self, _a: &Sample, _b: &Sample) -> (f64, Option<f64>) {
        match self.mode {}
    }
}

pub fn mean_freq_mhz(_cpus: &[usize]) -> Option<f64> {
    None
}
