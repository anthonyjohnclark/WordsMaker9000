#[tauri::command]
pub fn set_editor_fullscreen(
    window: tauri::WebviewWindow,
    fullscreen: bool,
    restore_maximized: bool,
    background_color: [u8; 4],
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return set_windows_editor_fullscreen(
            window,
            fullscreen,
            restore_maximized,
            background_color,
        );
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = restore_maximized;
        window
            .set_background_color(Some(tauri::window::Color(
                background_color[0],
                background_color[1],
                background_color[2],
                background_color[3],
            )))
            .map_err(|error| error.to_string())?;
        window
            .set_fullscreen(fullscreen)
            .map_err(|error| error.to_string())
    }
}

#[cfg(target_os = "windows")]
fn set_windows_editor_fullscreen(
    window: tauri::WebviewWindow,
    fullscreen: bool,
    restore_maximized: bool,
    background_color: [u8; 4],
) -> Result<(), String> {
    use std::sync::mpsc::sync_channel;

    let hwnd_value = window.hwnd().map_err(|error| error.to_string())?.0 as isize;
    let task_window = window.clone();
    let (sender, receiver) = sync_channel(1);

    window
        .run_on_main_thread(move || {
            let result = if fullscreen {
                enter_fullscreen(&task_window, hwnd_value, background_color)
            } else if restore_maximized {
                restore_maximized_window_from_fullscreen(&task_window, hwnd_value)
            } else {
                task_window
                    .set_fullscreen(false)
                    .map_err(|error| error.to_string())
            };

            let _ = sender.send(result);
        })
        .map_err(|error| error.to_string())?;

    receiver
        .recv()
        .map_err(|error| format!("fullscreen transition did not complete: {error}"))?
}

#[cfg(target_os = "windows")]
fn enter_fullscreen(
    window: &tauri::WebviewWindow,
    hwnd_value: isize,
    background_color: [u8; 4],
) -> Result<(), String> {
    window
        .set_background_color(Some(tauri::window::Color(
            background_color[0],
            background_color[1],
            background_color[2],
            background_color[3],
        )))
        .map_err(|error| error.to_string())?;
    set_window_transitions_disabled(hwnd_value, true)?;

    let transition_result = window
        .set_fullscreen(true)
        .map_err(|error| error.to_string())
        .and_then(|_| repair_maximized_fullscreen_client_area(hwnd_value));
    let animation_result = set_window_transitions_disabled(hwnd_value, false);

    transition_result.and(animation_result)
}

#[cfg(target_os = "windows")]
fn repair_maximized_fullscreen_client_area(hwnd_value: isize) -> Result<(), String> {
    use windows::Win32::{
        Foundation::HWND,
        UI::WindowsAndMessaging::{
            GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_STYLE, SWP_FRAMECHANGED,
            SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_MAXIMIZE,
        },
    };

    unsafe {
        let hwnd = HWND(hwnd_value as *mut _);
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        // Tao keeps WS_MAXIMIZE while applying fullscreen monitor bounds. On
        // affected Windows systems that clips the client area to the taskbar
        // work area. Clear only that stale style; Tauri still owns the saved
        // placement used when fullscreen exits.
        let corrected_style = style & !(WS_MAXIMIZE.0 as isize);

        if corrected_style != style {
            SetWindowLongPtrW(hwnd, GWL_STYLE, corrected_style);
            SetWindowPos(
                hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER,
            )
            .map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn restore_maximized_window_from_fullscreen(
    window: &tauri::WebviewWindow,
    hwnd_value: isize,
) -> Result<(), String> {
    set_window_transitions_disabled(hwnd_value, true)?;

    // Reestablish Tao's maximized state before it removes its fullscreen
    // styles. This prevents Windows from rendering the saved normal rectangle
    // on the way back to the maximized placement.
    let transition_result = window
        .maximize()
        .and_then(|_| window.set_fullscreen(false))
        .map_err(|error| error.to_string());
    let animation_result = set_window_transitions_disabled(hwnd_value, false);

    transition_result.and(animation_result)
}

#[cfg(target_os = "windows")]
fn set_window_transitions_disabled(hwnd_value: isize, disabled: bool) -> Result<(), String> {
    use std::{ffi::c_void, mem::size_of};
    use windows::Win32::{
        Foundation::HWND,
        Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED},
    };

    let value = i32::from(disabled);
    unsafe {
        DwmSetWindowAttribute(
            HWND(hwnd_value as *mut _),
            DWMWA_TRANSITIONS_FORCEDISABLED,
            (&value as *const i32).cast::<c_void>(),
            size_of::<i32>() as u32,
        )
        .map_err(|error| error.to_string())
    }
}
