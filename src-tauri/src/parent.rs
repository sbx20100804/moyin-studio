//! Parent native file dialogs to the app window so they don't open behind it.

#[cfg(windows)]
pub struct ParentHandle(pub isize);

#[cfg(windows)]
impl raw_window_handle::HasWindowHandle for ParentHandle {
    fn window_handle(
        &self,
    ) -> Result<raw_window_handle::WindowHandle<'_>, raw_window_handle::HandleError> {
        use raw_window_handle::{RawWindowHandle, WindowHandle};
        use std::num::NonZeroIsize;
        let hwnd = NonZeroIsize::new(self.0).ok_or(raw_window_handle::HandleError::Unavailable)?;
        let handle = unsafe { raw_window_handle::Win32WindowHandle::new(hwnd) };
        Ok(unsafe { WindowHandle::borrow_raw(RawWindowHandle::Win32(handle)) })
    }
}

#[cfg(windows)]
impl raw_window_handle::HasDisplayHandle for ParentHandle {
    fn display_handle(
        &self,
    ) -> Result<raw_window_handle::DisplayHandle<'_>, raw_window_handle::HandleError> {
        use raw_window_handle::{DisplayHandle, RawDisplayHandle, WindowsDisplayHandle};
        Ok(unsafe {
            DisplayHandle::borrow_raw(RawDisplayHandle::Windows(WindowsDisplayHandle::new()))
        })
    }
}

pub fn attach(dialog: rfd::FileDialog, hwnd: Option<isize>) -> rfd::FileDialog {
    #[cfg(windows)]
    {
        if let Some(h) = hwnd {
            return dialog.set_parent(&ParentHandle(h));
        }
    }
    let _ = hwnd;
    dialog
}
