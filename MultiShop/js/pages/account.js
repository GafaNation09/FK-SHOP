/* Knit&Crochet by Faith — customer authentication page. */
(function (window, document) {
    'use strict';

    const api = window.KCBF = window.KCBF || {};
    const forms = Array.from(document.querySelectorAll('[data-auth-form]'));
    const passwordToggles = Array.from(document.querySelectorAll('[data-password-toggle]'));
    const panels = Array.from(document.querySelectorAll('[data-auth-panel]'));
    const modeButtons = Array.from(document.querySelectorAll('[data-auth-mode]'));
    const modeTabs = document.querySelector('[data-auth-tabs]');
    const guestCard = document.querySelector('[data-auth-guest]');
    const sessionCard = document.querySelector('[data-auth-session]');
    const guestCopy = document.querySelector('[data-auth-guest-copy]');
    const sessionCopy = document.querySelector('[data-auth-session-copy]');
    const statusBox = document.querySelector('[data-auth-status]');
    const signoutButton = document.querySelector('[data-auth-signout]');
    const googleAuth = document.querySelector('[data-google-auth]');
    const googleButton = document.querySelector('[data-google-signin]');
    let supabase = null;
    let recoveryActive = false;
    let redirecting = false;
    let googleEnabled = false;
    let currentMode = 'signin';

    passwordToggles.forEach(function (button) {
        button.addEventListener('click', function () {
            const input = document.getElementById(button.getAttribute('aria-controls'));
            if (!input || (input.type !== 'password' && input.type !== 'text')) return;
            const showing = input.type === 'password';
            input.type = showing ? 'text' : 'password';
            const eye = button.querySelector('[data-password-eye]');
            const eyeSlash = button.querySelector('[data-password-eye-slash]');
            if (eye) eye.hidden = showing;
            if (eyeSlash) eyeSlash.hidden = !showing;
            const label = showing ? 'Hide password' : 'Show password';
            button.setAttribute('aria-label', label);
            button.setAttribute('title', label);
            button.setAttribute('aria-pressed', String(showing));
        });
    });

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
        currentMode = selected;
        panels.forEach(function (panel) { panel.hidden = panel.getAttribute('data-auth-panel') !== selected; });
        modeButtons.forEach(function (button) {
            const active = button.getAttribute('data-auth-mode') === selected;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
        });
        if (googleAuth) googleAuth.hidden = !googleEnabled || selected === 'recovery' || selected === 'update-password';
    }

    function setSignedIn(signedIn, inRecoveryFlow) {
        const showSession = Boolean(signedIn && !inRecoveryFlow);
        if (guestCard) guestCard.hidden = showSession;
        if (sessionCard) sessionCard.hidden = !showSession;
        if (guestCopy) guestCopy.hidden = Boolean(signedIn);
        if (sessionCopy) sessionCopy.hidden = !showSession;
        if (modeTabs) modeTabs.hidden = Boolean(inRecoveryFlow);
        if (signoutButton) signoutButton.hidden = !signedIn;
    }

    function accountUrl(query) {
        const url = new URL('account.html', window.location.href);
        url.search = query || '';
        url.hash = '';
        return url.toString();
    }

    function isAdminDestination(value) {
        try {
            const target = new URL(value, window.location.origin);
            const path = target.pathname.replace(/\/+$/, '');
            return target.origin === window.location.origin && (path === '/multishop/admin' || path.startsWith('/multishop/admin/'));
        } catch (error) {
            return false;
        }
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
        if (/email.*rate limit|too many email/i.test(message)) return 'Supabase Auth blocked this email request because the current provider rate limit was reached. Wait before retrying; production delivery needs a verified SMTP sender.';
        if (/email address not authorized|recipient.*not authorized/i.test(message)) return 'Supabase’s default email service does not authorize this recipient. A verified production SMTP sender is required.';
        if (/\bsmtp\b/i.test(message)) return 'Supabase Auth could not send this email through SMTP. Check the configured SMTP host, port, credentials, TLS, and verified sender in the Auth logs.';
        if (/password/i.test(message) && /weak|short|length/i.test(message)) return 'Choose a stronger password and try again.';
        return message || 'The request could not be completed. Please try again.';
    }

    function setConfigured(enabled) {
        forms.forEach(function (form) {
            form.querySelectorAll('button[type="submit"]').forEach(function (button) { button.disabled = !enabled; });
        });
        if (!enabled) showStatus('Account services are not connected yet. No account information was sent or saved. Please try again after secure project configuration.', 'info');
        else showStatus('Account services are connected. Email confirmation is required for new customer accounts; this page cannot verify email delivery.', 'info');
    }

    async function isActiveAdministrator(userId) {
        if (!supabase || !userId) return false;
        const result = await supabase.from('admin_memberships')
            .select('role,status')
            .eq('user_id', userId)
            .maybeSingle();
        if (result.error) throw result.error;
        const membership = result.data;
        return Boolean(membership && membership.status === 'active' &&
            (membership.role === 'super_admin' || membership.role === 'admin'));
    }

    async function routeAuthenticatedSession(session) {
        if (!session || !session.user) {
            setSignedIn(false, false);
            return false;
        }
        setSignedIn(true, recoveryActive);
        if (recoveryActive || redirecting) return redirecting;
        if (!session.user.email_confirmed_at) {
            setSignedIn(false, false);
            if (signoutButton) signoutButton.hidden = false;
            showStatus('Please confirm your email address before continuing. Check your inbox, then return and sign in.', 'info');
            return false;
        }

        let isAdmin = false;
        try {
            isAdmin = await isActiveAdministrator(session.user.id);
        } catch (error) {
            showStatus('You are signed in, but account status could not be checked. Please refresh and try again.', 'error');
            return false;
        }

        if (isAdmin) {
            redirecting = true;
            window.location.replace(new URL('/multishop/admin/', window.location.origin).toString());
            return true;
        }

        const destination = safeReturnTo();
        if (destination && !isAdminDestination(destination)) {
            redirecting = true;
            window.location.assign(destination);
            return true;
        }

        showStatus('You are signed in. Continue shopping below, or sign out to switch accounts.', 'success');
        return false;
    }

    function subscribeToAuthEvents() {
        supabase.auth.onAuthStateChange(function (event, session) {
            if (event === 'PASSWORD_RECOVERY') {
                recoveryActive = true;
                setSignedIn(Boolean(session), true);
                setMode('update-password');
                showStatus('Recovery link verified. Choose a new password for your account.', 'success');
            } else if (event === 'SIGNED_IN' && session && !recoveryActive) {
                window.setTimeout(function () {
                    routeAuthenticatedSession(session).catch(function () {
                        showStatus('You are signed in, but account status could not be checked. Please refresh and try again.', 'error');
                    });
                }, 0);
            } else if (event === 'SIGNED_OUT') {
                recoveryActive = false;
                redirecting = false;
                setSignedIn(false, false);
                setMode('signin');
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
        if (!supabase) {
            setConfigured(false);
            setSignedIn(false, false);
            return;
        }
        setConfigured(true);
        subscribeToAuthEvents();

        const providerSettings = api.authProviderSettings && typeof api.authProviderSettings.then === 'function'
            ? await api.authProviderSettings
            : {};
        googleEnabled = Boolean(providerSettings && providerSettings.google === true);
        setMode(currentMode);

        const query = new URLSearchParams(window.location.search);
        if (query.get('mode') === 'signup' || query.get('mode') === 'recovery') setMode(query.get('mode'));
        if (query.get('signedOut') === '1') {
            await supabase.auth.signOut();
            setSignedIn(false, false);
            setMode('signin');
            showStatus('You are signed out.', 'success');
            return;
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
            setSignedIn(false, false);
            showStatus('Account session could not be loaded. Please refresh and try again.', 'error');
            return;
        }
        const session = sessionData && sessionData.session;

        if (!session && (query.has('error') || query.has('error_description'))) {
            setSignedIn(false, false);
            if (query.get('flow') === 'recovery') {
                setMode('recovery');
                showStatus('The recovery link is invalid or expired. Request a new password-reset email and use the latest link.', 'error');
            } else if (query.get('confirmed') === '1' || query.get('type') === 'signup') {
                setMode('signin');
                showStatus('The confirmation link is invalid or expired. Request a new confirmation email and use the latest link.', 'error');
            } else if (query.get('oauth') === 'google') {
                showStatus('Google sign-in was canceled or could not be completed. Please try again.', 'error');
            } else {
                showStatus('This authentication link is invalid or expired. Request a new link and try again.', 'error');
            }
            return;
        }

        if (query.get('flow') === 'recovery') {
            if (session) {
                recoveryActive = true;
                setSignedIn(true, true);
                setMode('update-password');
                showStatus('Recovery link verified. Choose a new password for your account.', 'success');
            } else {
                setSignedIn(false, false);
                setMode('recovery');
                showStatus('That recovery link could not establish a session. Request a new link and use the latest email.', 'error');
            }
            return;
        }

        if (session) {
            const redirected = await routeAuthenticatedSession(session);
            if (redirected) return;
            if (query.get('oauth') === 'google' && session.user.email_confirmed_at) {
                showStatus('Google sign-in succeeded. Your account is signed in.', 'success');
            }
        } else {
            setSignedIn(false, false);
            if (query.get('oauth') === 'google') {
                showStatus('Google sign-in did not establish a session. Please try again.', 'error');
                return;
            }
        }

        if (query.get('confirmed') === '1') {
            showStatus(session ? 'Email confirmed. Your account is active.' : 'Email confirmation received. You can now sign in.', 'success');
            if (!session) setMode('signin');
        } else if (query.get('invite') === '1') {
            showStatus(session ? 'Your account is active. Continue shopping or sign out below.' : 'Your account is ready. Sign in to continue.', 'success');
            if (!session) setMode('signin');
        }
    }).catch(function () {
        setConfigured(false);
        setSignedIn(false, false);
        showStatus('Account services could not be initialized. Please refresh and try again.', 'error');
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
                        await routeAuthenticatedSession(data.session);
                    } else {
                        setMode('signin');
                        showStatus('Account request received. Check your inbox and spam folder for a confirmation link. This response does not confirm that the email was delivered.', 'success');
                    }
                } else if (kind === 'signin') {
                    const { data, error } = await supabase.auth.signInWithPassword({
                        email: String(values.email).trim(),
                        password: values.password
                    });
                    if (error) throw error;
                    if (!data || !data.session) throw new Error('Sign-in did not create a session. Confirm your email and try again.');
                    await routeAuthenticatedSession(data.session);
                } else if (kind === 'recovery') {
                    const { error } = await supabase.auth.resetPasswordForEmail(String(values.email).trim(), {
                        redirectTo: accountUrl('?flow=recovery')
                    });
                    if (error) throw error;
                    showStatus('If an account exists, a recovery request was accepted. Check your inbox and spam folder for a link; this response does not confirm email delivery.', 'success');
                } else if (kind === 'update-password') {
                    if (!recoveryActive) throw new Error('Open the password recovery link from your email before setting a new password.');
                    if (values.password !== values.confirmPassword) throw new Error('Passwords do not match.');
                    if (values.password.length < 10) throw new Error('Choose a password with at least 10 characters.');
                    const { error } = await supabase.auth.updateUser({ password: values.password });
                    if (error) throw error;
                    recoveryActive = false;
                    window.history.replaceState({}, document.title || '', accountUrl(''));
                    const { data: currentSession } = await supabase.auth.getSession();
                    if (currentSession && currentSession.session) {
                        await routeAuthenticatedSession(currentSession.session);
                    } else {
                        setSignedIn(false, false);
                        setMode('signin');
                        showStatus('Password updated. Sign in with your new password.', 'success');
                    }
                }
            } catch (error) {
                showStatus(explainError(error), 'error');
            } finally {
                setBusy(form, false);
            }
        });
    });

    googleButton?.addEventListener('click', async function () {
        if (!supabase || !googleEnabled) {
            showStatus('Google sign-in is not configured for this store yet.', 'error');
            return;
        }
        googleButton.disabled = true;
        googleButton.setAttribute('aria-busy', 'true');
        showStatus('', 'info');
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: accountUrl('?oauth=google'),
                    queryParams: { prompt: 'select_account' }
                }
            });
            if (error) throw error;
        } catch (error) {
            showStatus('Google sign-in could not start. Please try again or use email sign-in.', 'error');
            googleButton.disabled = false;
            googleButton.removeAttribute('aria-busy');
        }
    });

    signoutButton?.addEventListener('click', async function () {
        if (!supabase) return;
        signoutButton.disabled = true;
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            recoveryActive = false;
            redirecting = false;
            setSignedIn(false, false);
            setMode('signin');
            showStatus('You are signed out.', 'success');
        } catch (error) {
            showStatus(explainError(error), 'error');
        } finally {
            signoutButton.disabled = false;
        }
    });
}(window, document));
