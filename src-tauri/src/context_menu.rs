// Spike: WebView2 ContextMenuRequested logger.
//
// Goal of this spike is ONLY to prove we can (1) intercept the native context
// menu, (2) read every item — including spell-check suggestions — with their
// CommandId / Kind / Label, and (3) confirm the handler fires reliably.
//
// It does NOT yet suppress the native menu or render a custom one. Right-click
// in the editor (and on a misspelled word) and copy the "[context-menu]" lines
// printed to the `tauri dev` terminal so we can design the real bridge.

#[cfg(target_os = "windows")]
pub fn attach_context_menu_logger(window: &tauri::WebviewWindow) {
    use webview2_com::ContextMenuRequestedEventHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2ContextMenuRequestedEventArgs, ICoreWebView2_11,
    };
    use windows::core::Interface;

    let result = window.with_webview(|webview| unsafe {
        let controller = webview.controller();
        let core = match controller.CoreWebView2() {
            Ok(core) => core,
            Err(e) => {
                eprintln!("[context-menu] failed to get CoreWebView2: {e:?}");
                return;
            }
        };

        // ContextMenu APIs live on ICoreWebView2_11 (WebView2 runtime 1.0.705+).
        let core11: ICoreWebView2_11 = match core.cast() {
            Ok(c) => c,
            Err(e) => {
                eprintln!(
                    "[context-menu] runtime too old / cast to ICoreWebView2_11 failed: {e:?}"
                );
                return;
            }
        };

        let handler = ContextMenuRequestedEventHandler::create(Box::new(
            move |_sender: Option<ICoreWebView2>,
                  args: Option<ICoreWebView2ContextMenuRequestedEventArgs>| {
                if let Some(args) = args {
                    log_requested(&args);
                }
                Ok(())
            },
        ));

        let mut token = std::mem::zeroed();
        match core11.add_ContextMenuRequested(&handler, &mut token) {
            Ok(_) => {
                println!("[context-menu] handler attached; right-click in the editor to log items")
            }
            Err(e) => eprintln!("[context-menu] add_ContextMenuRequested failed: {e:?}"),
        }
    });

    if let Err(e) = result {
        eprintln!("[context-menu] with_webview failed: {e:?}");
    }
}

#[cfg(target_os = "windows")]
unsafe fn log_requested(
    args: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2ContextMenuRequestedEventArgs,
) {
    use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND;
    use windows::Win32::Foundation::BOOL;

    // Target context: is it editable text, is there a selection, etc.
    if let Ok(target) = args.ContextMenuTarget() {
        let mut editable = BOOL::default();
        let _ = target.IsEditable(&mut editable);
        let mut has_selection = BOOL::default();
        let _ = target.HasSelection(&mut has_selection);
        let mut kind = COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND::default();
        let _ = target.Kind(&mut kind);
        println!(
            "[context-menu] --- request --- target_kind={} editable={} has_selection={}",
            kind.0,
            editable.as_bool(),
            has_selection.as_bool()
        );
    }

    if let Ok(items) = args.MenuItems() {
        let mut count = 0u32;
        let _ = items.Count(&mut count);
        println!("[context-menu] {count} top-level items:");
        for i in 0..count {
            if let Ok(item) = items.GetValueAtIndex(i) {
                log_item(&item, 1);
            }
        }
    }
}

#[cfg(target_os = "windows")]
unsafe fn log_item(
    item: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2ContextMenuItem,
    depth: usize,
) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SUBMENU,
    };
    use windows::core::PWSTR;
    use windows::Win32::Foundation::BOOL;

    let indent = "  ".repeat(depth);

    let read_pwstr = |get: &dyn Fn(*mut PWSTR) -> windows::core::Result<()>| -> (String, bool) {
        let mut ptr = PWSTR::null();
        let _ = get(&mut ptr);
        if ptr.is_null() {
            (String::new(), true)
        } else {
            (ptr.to_string().unwrap_or_default(), false)
        }
    };

    let (label, label_null) = read_pwstr(&|p| item.Label(p));
    let (name, name_null) = read_pwstr(&|p| item.Name(p));

    let mut command_id = 0i32;
    let _ = item.CommandId(&mut command_id);

    let mut kind = COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND::default();
    let _ = item.Kind(&mut kind);

    let mut enabled = BOOL::default();
    let _ = item.IsEnabled(&mut enabled);

    println!(
        "{indent}- id={command_id} kind={} enabled={} label={label:?}(null={label_null}) name={name:?}(null={name_null})",
        kind.0,
        enabled.as_bool()
    );

    // Only recurse into submenus (Children() is only valid for submenu items).
    if kind == COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SUBMENU {
        if let Ok(children) = item.Children() {
            let mut count = 0u32;
            let _ = children.Count(&mut count);
            for i in 0..count {
                if let Ok(child) = children.GetValueAtIndex(i) {
                    log_item(&child, depth + 1);
                }
            }
        }
    }
}

// No-op on non-Windows platforms so the app still compiles cross-platform.
#[cfg(not(target_os = "windows"))]
pub fn attach_context_menu_logger(_window: &tauri::WebviewWindow) {}
