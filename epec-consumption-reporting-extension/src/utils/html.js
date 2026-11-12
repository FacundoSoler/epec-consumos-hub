/** Escapes text that ends up inside email HTML, so user-provided values cannot inject markup. */
export function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
