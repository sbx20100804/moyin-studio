//! Windows DPAPI helpers 鈥?API keys are encrypted with the current user's
//! credentials before ever touching the database file.

use base64::Engine;
use std::ffi::c_void;
use std::ptr;

const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

#[repr(C)]
struct DataBlob {
    cb_data: u32,
    pb_data: *mut u8,
}

#[link(name = "crypt32")]
extern "system" {
    fn CryptProtectData(
        p_data_in: *const DataBlob,
        sz_data_descr: *const u16,
        p_optional_entropy: *const DataBlob,
        pv_reserved: *mut c_void,
        p_prompt_struct: *mut c_void,
        dw_flags: u32,
        p_data_out: *mut DataBlob,
    ) -> i32;

    fn CryptUnprotectData(
        p_data_in: *const DataBlob,
        ppsz_data_descr: *mut *mut u16,
        p_optional_entropy: *const DataBlob,
        pv_reserved: *mut c_void,
        p_prompt_struct: *mut c_void,
        dw_flags: u32,
        p_data_out: *mut DataBlob,
    ) -> i32;
}

#[link(name = "kernel32")]
extern "system" {
    fn LocalFree(h_mem: *mut c_void) -> *mut c_void;
}

pub fn protect(plain: &str) -> Result<String, String> {
    if plain.is_empty() {
        return Ok(String::new());
    }
    unsafe {
        let mut data = plain.as_bytes().to_vec();
        let in_blob = DataBlob {
            cb_data: data.len() as u32,
            pb_data: data.as_mut_ptr(),
        };
        let mut out_blob = DataBlob {
            cb_data: 0,
            pb_data: ptr::null_mut(),
        };
        let ok = CryptProtectData(
            &in_blob,
            ptr::null(),
            ptr::null(),
            ptr::null_mut(),
            ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        );
        if ok == 0 {
            return Err("绯荤粺鍔犲瘑澶辫触 (DPAPI)".into());
        }
        let slice = std::slice::from_raw_parts(out_blob.pb_data, out_blob.cb_data as usize);
        let encoded = base64::engine::general_purpose::STANDARD.encode(slice);
        LocalFree(out_blob.pb_data as *mut c_void);
        Ok(encoded)
    }
}

pub fn unprotect(encoded: &str) -> Result<String, String> {
    if encoded.is_empty() {
        return Ok(String::new());
    }
    let mut raw = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| format!("瀵嗛挜瑙ｇ爜澶辫触: {e}"))?;
    unsafe {
        let in_blob = DataBlob {
            cb_data: raw.len() as u32,
            pb_data: raw.as_mut_ptr(),
        };
        let mut out_blob = DataBlob {
            cb_data: 0,
            pb_data: ptr::null_mut(),
        };
        let ok = CryptUnprotectData(
            &in_blob,
            ptr::null_mut(),
            ptr::null(),
            ptr::null_mut(),
            ptr::null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        );
        if ok == 0 {
            return Err("绯荤粺瑙ｅ瘑澶辫触锛氬瘑閽ュ彲鑳界敱鍏朵粬 Windows 璐︽埛淇濆瓨".into());
        }
        let slice = std::slice::from_raw_parts(out_blob.pb_data, out_blob.cb_data as usize);
        let text = String::from_utf8_lossy(slice).to_string();
        LocalFree(out_blob.pb_data as *mut c_void);
        Ok(text)
    }
}

