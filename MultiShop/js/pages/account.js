/* Knit&Crochet by Faith — customer authentication page. */
(function (window, document) {
    'use strict';

    const api = window.KCBF = window.KCBF || {};
    const forms = Array.from(document.querySelectorAll('[data-auth-form]'));
    const panels = Array.from(document.querySelectorAll('[data-auth-panel]'));
    const modeButtons = Array.from(document.querySelectorAll('[data-auth-mode]'));
    const statusBox = document.querySelector('[data-auth-status]');
    const signoutButton = document.querySelector('[data-auth-signout]');
    let supabase = null;
    let recoveryActive = false;

    function showStatus(message, kind) {
        if (!statusBox) return;
        statusBox.hidden = !message;
        statusBox.textContent = message || '';
        statusBox.className = 'alert ' + (kind === 'error' ? 'alert-danger' : kind === 'success' ? 'alert-success' : 'alert-info');
    }

    function setBusy(form, busy) {
        form.querySelectorAll('button[type="submit"]').forEach(function (button) {
            button.disabled = busy;
            button.setAttribute('aria-busy', String(busy));
        });
    }

    function setMode(mode) {
        const selected = mode === 'update-password' ? 'update-password' : mode;
        panels.forEach(function (panel) { panel.hidden = panel.getAttribute('data-auth-panel') !== selected; });
        modeButtons.forEach(function (button) {
            const active = button.getAttribute('data-auth-mode') === selected;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
        });
    }

    function accountUrl(query) {
        const url = new URL('account.html', window.location.href);
        if (query) url.search = query;
        url.hash = '';
        return url.toString();
    }

    function safeReturnTo() {
        const candidate = new URLSearchParams(window.location.search).get('returnTo');
        if (!candidate) return '';
        try {
            const target = new URL(candidate, window.location.origin);
            if (target.origin !== window.location.origin || !target.pathname.startsWith('/multishop/')) return '';
            return target.toString();
        } catch (error) {
            return '';
        }
    }

    function readForm(form) {
        return Object.fromEntries(new FormData(form).entries());
    }

    function explainError(error) {
        if (!error) return 'The request could not be completed. Please try again.';
        const message = String(error.message || '');
        if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
        if (/email not confirmed/i.test(message)) return 'Confirm your email address using the link we sent before signing in.';
        if (/email address not authorized|email.*rate limit|smtp/i.test(message)) return 'The confirmation or recovery email could not be delivered to this address yet. The store needs a verified SMTP sender for customer emails; please try again after email delivery is configured.';
        if (/password/i.test(message) && /weak|short|length/i.test(message)) return 'Choose a stronger password and try again.';
        return message || 'The request could not be completed. Please try again.';
    }

    function setConfigured(enabled) {
        forms.forEach(function (form) {
            form.querySelectorAll('button[type="submit"]').forEach(function (button) { button.disabled = !enabled; });
        });
        if (!enabled) showStatus('Account services are not connected yet. No account information was sent or saved. Please try again after secure project configuration.', 'info');
        else showStatus('Account services are connected and email confirmation is required. Public customer confirmation and recovery emails still need a verified SMTP sender.', 'info');
    }

    function setSignedIn(signedIn) {
        if (signoutButton) signoutButton.hidden = !signedIn;
    }

    function subscribeToAuthEvents() {
        supabase.auth.onAuthStateChange(function (event, session) {
            if (event === 'PASSWORD_RECOVERY') {
                recoveryActive = true;
                setMode('update-password');
                showStatus('Recovery link verified. Choose a new password for your account.', 'success');
            } else if (event === 'SIGNED_IN' && session && !recoveryActive) {
                setSignedIn(true);
                showStatus('You are signed in. Profile, order and wishlist tools are not available yet; administrator access is checked separately.', 'success');
            } else if (event === 'SIGNED_OUT') {
                setSignedIn(false);
            }
        });
    }

    modeButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            showStatus('', 'info');
            setMode(button.getAttribute('data-auth-mode'));
        });
    });

    api.backendReady.then(async function (client) {
        supabase = client;
        const query = new URLSearchParams(window.location.search);
        if (query.get('mode') === 'signup' || query.get('mode') === 'recovery') setMode(query.get('mode'));
        if (!supabase) {
            setConfigured(false);
            return;
        }
        setConfigured(true);
        subscribeToAuthEvents();
        const { data: sessionData } = await supabase.auth.getSession();
        const hasSession = Boolean(sessionData && sessionData.session);
        setSignedIn(hasSession);

        if (query.get('signedOut') === '1') {
            await supabase.auth.signOut();
            setSignedIn(false);
            showStatus('You are signed out.', 'success');
        } else if (query.get('confirmed') === '1') {
            showStatus(hasSession ? 'Email confirmed. Your sign-in session is active.' : 'Email confirmation received. You can now sign in.', 'success');
            setMode('signin');
        } else if (query.get('invite') === '1') {
            showStatus(hasSession ? 'Administrator invitation accepted. Your role is checked separately.' : 'Administrator invitation accepted. Sign in to continue; access is checked separately.', 'success');
            setMode('signin');
        } else if (query.get('flow') === 'recovery') {
            if (hasSession) {
                recoveryActive = true;
                setMode('update-password');
                showStatus('Recovery link verified. Choose a new password for your account.', 'success');
            } else {
                setMode('recovery');
                showStatus('That recovery link could not establish a session. Request a new link and use the latest email.', 'error');
            }
        }
    });

    forms.forEach(function (form) {
        form.addEventListener('submit', async function (event) {
            event.preventDefault();
            showStatus('', 'info');
            if (!supabase) {
                showStatus('Account services are not connected yet. No account information was sent or saved.', 'error');
                return;
            }
            if (!form.reportValidity()) return;
            const values = readForm(form);
            const kind = form.getAttribute('data-auth-form');
            setBusy(form, true);
            try {
                if (kind === 'signup') {
                    if (values.password !== values.confirmPassword) throw new Error('Passwords do not match.');
                    if (values.password.length < 10) throw new Error('Choose a password with at least 10 characters.');
                    const { data, error } = await supabase.auth.signUp({
                        email: String(values.email).trim(),
                        password: values.password,
                        options: {
                            emailRedirectTo: accountUrl('?confirmed=1'),
                            data: { full_name: String(values.fullName || '').trim() }
                        }
                    });
                    if (error) throw error;
                    if (data && data.session) {
                        showStatus('Account created and email confirmed. You are signed in.', 'success');
                    } else {
                        showStatus('Account request received. Check your email and confirm the address before signing in.', 'success');
                    }
                } else if (kind === 'signin') {
                    const { data, error } = await supabase.auth.signInWithPassword({
                        email: String(values.email).trim(),
                        password: values.password
                    });
                    if (error) throw error;
                    if (!data || !data.session) throw new Error('Sign-in did not create a session. Confirm your email and try again.');
                    const destination = safeReturnTo();
                    if (destination) window.location.assign(destination);
                    else showStatus('You are signed in. Profile, order and wishlist tools are not available yet; administrator access is checked separately.', 'success');
                } else if (kind === 'recovery') {
                    const { error } = await supabase.auth.resetPasswordForEmail(String(values.email).trim(), {
                        redirectTo: accountUrl('?flow=recovery')
                    });
                    if (error) throw error;
                    showStatus('If an account exists for that email, a recovery link has been sent.', 'success');
                } else if (kind === 'update-password') {
                    if (!recoveryActive) throw new Error('Open the password recovery link from your email before setting a new password.');
                    if (values.password !== values.confirmPassword) throw new Error('Passwords do not match.');
                    if (values.password.length < 10) throw new Error('Choose a password with at least 10 characters.');
                    const { error } = await supabase.auth.updateUser({ password: values.password });
                    if (error) throw error;
                    recoveryActive = false;
                    window.history.replaceState({}, document.title, accountUrl(''));
                    setMode('signin');
                    showStatus('Password updated. Sign in with your new password.', 'success');
                }
            } catch (error) {
                showStatus(explainError(error), 'error');
            } finally {
                setBusy(form, false);
            }
        });
    });

    signoutButton?.addEventListener('click', async function () {
        if (!supabase) return;
        signoutButton.disabled = true;
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            setSignedIn(false);
            showStatus('You are signed out.', 'success');
        } catch (error) {
            showStatus(explainError(error), 'error');
        } finally {
            signoutButton.disabled = false;
        }
    });
}(window, document));
