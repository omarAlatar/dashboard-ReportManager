let totpInterval = null;
let accountsConfig = [];
let currentTotpMode = 'auto';

// Fetch the accounts array when the script loads
async function fetchAccountsConfig() {
    try {
        const response = await fetch('/api/totp-accounts');
        accountsConfig = await response.json();
        populateTotpDropdown();
    } catch (e) {
        console.error("Failed to load TOTP accounts from .env", e);
    }
}

// Populate the <select> dropdown with accounts that have a totpSecret
function populateTotpDropdown() {
    const select = document.getElementById('totpAccountSelect');
    select.innerHTML = '<option value="">-- Select an account --</option>';
    
    const validAccounts = accountsConfig.filter(acc => acc.totpSecret && acc.totpSecret.trim() !== "");

    validAccounts.forEach(acc => {
        const option = document.createElement('option');
        option.value = acc.totpSecret; 
        const listNumber = accountsConfig.indexOf(acc) + 1;
        option.innerText = `#${listNumber} - ${acc.email}`;
        select.appendChild(option);
    });
}

// 1. Listen to Select changes: Update the Input box automatically
document.getElementById('totpAccountSelect').addEventListener('change', function() {
    const rawSecret = this.value;
    const indexInput = document.getElementById('totpIndexInput');
    
    if (rawSecret) {
        // Find which account has this secret to get the correct number
        const accIndex = accountsConfig.findIndex(a => a.totpSecret === rawSecret);
        if (accIndex !== -1) indexInput.value = accIndex + 1;
    } else {
        indexInput.value = '';
    }
    generateTotpCode();
});

// 2. Listen to Input changes: Update the Select box automatically
document.getElementById('totpIndexInput').addEventListener('input', function(e) {
    const num = parseInt(e.target.value);
    const select = document.getElementById('totpAccountSelect');
    
    // Check if the number is valid and exists in our list
    if (!isNaN(num) && num > 0 && num <= accountsConfig.length) {
        const acc = accountsConfig[num - 1]; // Array is 0-indexed, but our input is 1-indexed
        if (acc && acc.totpSecret) {
            select.value = acc.totpSecret;
            generateTotpCode();
            return;
        }
    }
    
    // If the account doesn't exist or has no secret, clear the view
    select.value = "";
    generateTotpCode();
});

// Handle switching between Auto Dropdown and Manual Input
function setTotpMode(mode) {
    currentTotpMode = mode;
    const btnAuto = document.getElementById('totpModeAuto');
    const btnManual = document.getElementById('totpModeManual');
    const secAuto = document.getElementById('totpAutoSection');
    const secManual = document.getElementById('totpManualSection');

    if (mode === 'auto') {
        btnAuto.className = 'flex-1 text-sm font-bold py-2 rounded-md bg-slate-800 text-blue-400 shadow transition';
        btnManual.className = 'flex-1 text-sm font-bold py-2 rounded-md text-slate-500 hover:text-slate-300 transition';
        secAuto.classList.remove('hidden');
        secManual.classList.add('hidden');
    } else {
        btnManual.className = 'flex-1 text-sm font-bold py-2 rounded-md bg-slate-800 text-blue-400 shadow transition';
        btnAuto.className = 'flex-1 text-sm font-bold py-2 rounded-md text-slate-500 hover:text-slate-300 transition';
        secManual.classList.remove('hidden');
        secAuto.classList.add('hidden');
    }
    
    generateTotpCode();
}

document.getElementById('totpManualInput').addEventListener('input', generateTotpCode);

// The Core Generator Engine
function generateTotpCode() {
    let rawSecret = '';

    if (currentTotpMode === 'auto') {
        rawSecret = document.getElementById('totpAccountSelect').value;
        
        // Show the raw secret key under the dropdown
        const secretDisplay = document.getElementById('totpSecretDisplay');
        const secretValue = document.getElementById('totpSecretValue');
        if (rawSecret && rawSecret.trim() !== '') {
            secretValue.innerText = rawSecret;
            secretDisplay.classList.remove('hidden');
        } else {
            secretDisplay.classList.add('hidden');
        }
    } else {
        rawSecret = document.getElementById('totpManualInput').value;
    }

    const codeDisplay = document.getElementById('totpCode');

    if (!rawSecret || rawSecret.trim() === '') {
        codeDisplay.innerText = "--- ---";
        codeDisplay.classList.replace('text-white', 'text-slate-600');
        return;
    }

    try {
        const cleanSecret = rawSecret.replace(/\s+/g, '').toUpperCase();
        
        let totp = new OTPAuth.TOTP({
            issuer: 'BotDashboard',
            label: 'Account',
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromBase32(cleanSecret)
        });

        let code = totp.generate();
        
        codeDisplay.innerText = `${code.slice(0, 3)} ${code.slice(3)}`;
        codeDisplay.classList.replace('text-slate-600', 'text-white');
    } catch (e) {
        codeDisplay.innerText = "INVALID";
        codeDisplay.classList.replace('text-white', 'text-red-400');
    }
}

// Click to Copy Logic
function copyTotp() {
    const code = document.getElementById('totpCode').innerText.replace(/\s/g, '');
    if (code === "------" || code === "INVALID") return;

    navigator.clipboard.writeText(code).then(() => {
        const msg = document.getElementById('totpCopyMsg');
        msg.classList.remove('opacity-0');
        setTimeout(() => msg.classList.add('opacity-0'), 1500);
    });
}

// Modal Controls
function openTotpModal() {
    document.getElementById('totpModal').classList.remove('hidden');
    document.getElementById('totpModal').classList.add('flex');
    if (accountsConfig.length === 0) fetchAccountsConfig();
    
    generateTotpCode();
    if (totpInterval) clearInterval(totpInterval);
    totpInterval = createCountdown(
        document.getElementById('totpProgressBar'),
        document.getElementById('totpTimerText'),
        generateTotpCode
    );
}

function closeTotpModal() {
    document.getElementById('totpModal').classList.add('hidden');
    document.getElementById('totpModal').classList.remove('flex');
    if (totpInterval) clearInterval(totpInterval);
}

window.addEventListener('click', function(event) {
    const modal = document.getElementById('totpModal');
    if (event.target === modal) closeTotpModal();
});