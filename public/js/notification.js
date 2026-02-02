// notification.js - Ltoasteur-inspired Toast Notification System

// Toast container
let toastContainer;

// Initialize toast container
function initToast() {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
}

// Show toast notification with title and message
function showToast(title, message, type = 'info', duration = 4000) {
    initToast();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} toast-enter`;
    
    // Icons for different types
    const icons = {
        success: 'check-circle',
        error: 'x-circle',
        warning: 'alert-triangle',
        info: 'info'
    };
    
    const icon = icons[type] || icons.info;
    
    toast.innerHTML = `
        <div class="toast-icon">
            <i data-lucide="${icon}" class="w-5 h-5 text-white"></i>
        </div>
        <div class="toast-content">
            ${title ? `<h4 class="toast-title">${title}</h4>` : ''}
            <p class="toast-message">${message}</p>
        </div>
        <button class="toast-close" onclick="closeToast(this)" aria-label="Close">
            <i data-lucide="x" class="w-4 h-4"></i>
        </button>
        ${duration > 0 ? `<div class="toast-progress" style="animation-duration: ${duration}ms;"></div>` : ''}
    `;
    
    toastContainer.appendChild(toast);
    
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // Trigger enter animation
    setTimeout(() => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-show');
    }, 10);
    
    // Auto remove after duration
    if (duration > 0) {
        setTimeout(() => {
            removeToast(toast);
        }, duration);
    }
    
    return toast;
}

// Remove toast
function removeToast(toast) {
    if (!toast || !toast.parentElement) return;
    
    toast.classList.remove('toast-show');
    toast.classList.add('toast-exit');
    
    setTimeout(() => {
        if (toast.parentElement) {
            toast.parentElement.removeChild(toast);
        }
    }, 350);
}

// Close toast by button
function closeToast(button) {
    const toast = button.closest('.toast');
    removeToast(toast);
}

// Helper functions with title support
window.toast = {
    success: (message, title = 'Thành công', duration) => showToast(title, message, 'success', duration),
    error: (message, title = 'Lỗi', duration) => showToast(title, message, 'error', duration),
    warning: (message, title = 'Cảnh báo', duration) => showToast(title, message, 'warning', duration),
    info: (message, title = 'Thông báo', duration) => showToast(title, message, 'info', duration),
    // Without title
    successNoTitle: (message, duration) => showToast('', message, 'success', duration),
    errorNoTitle: (message, duration) => showToast('', message, 'error', duration),
    warningNoTitle: (message, duration) => showToast('', message, 'warning', duration),
    infoNoTitle: (message, duration) => showToast('', message, 'info', duration)
};

// Override alert for modern toast
const originalAlert = window.alert;
window.alert = function(message) {
    if (typeof message === 'string' && message.length > 0) {
        showToast('', message, 'info', 4000);
    } else {
        originalAlert(message);
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', initToast);
