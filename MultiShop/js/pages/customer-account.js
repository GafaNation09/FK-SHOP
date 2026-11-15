/* Customer profile, email-change request and order history for account.html. */
(function (window, document) {
    'use strict';

    const api = window.KCBF = window.KCBF || {};
    const profileForm = document.querySelector('[data-customer-profile-form]');
    const emailForm = document.querySelector('[data-customer-email-form]');
    const orderRegion = document.querySelector('[data-order-history]');
    const profileStatus = document.querySelector('[data-profile-status]');
    const emailStatus = document.querySelector('[data-email-status]');
    const nameInput = document.querySelector('#customer-full-name');
    const telephoneInput = document.querySelector('#customer-telephone');
    const currentEmailInput = document.querySelector('#customer-current-email');
    let supabase = null;
    let activeUser = null;
    let loadVersion = 0;
    let profileAnchorHandled = false;

    function status(target, message, kind) {
        if (!target) return;
        target.textContent = message || '';
        target.className = 'small mt-2 mb-0 ' + (kind === 'error' ? 'text-danger' : kind === 'success' ? 'text-success' : 'text-muted');
    }

    function busy(form, value) {
        form.querySelectorAll('button[type="submit"]').forEach(function (button) {
            button.disabled = value;
            button.setAttribute('aria-busy', String(value));
        });
    }

    function errorText(error) {
        return error && error.message ? String(error.message) : 'The request could not be completed. Please try again.';
    }

    function node(tag, text, className) {
        const element = document.createElement(tag);
        if (text !== undefined && text !== null) element.textContent = String(text);
        if (className) element.className = className;
        return element;
    }

    function money(value, currency) {
        const amount = Number(value);
        if (!Number.isFinite(amount)) return 'KES —';
        const code = currency || 'KES';
        try {
            return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(amount);
        } catch (error) {
            return code + ' ' + amount.toFixed(2);
        }
    }

    function dateText(value) {
        if (!value) return 'Date unavailable';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
    }

    function humanizeStatus(value) {
        const words = String(value || 'unknown').replace(/[_-]+/g, ' ').trim();
        return words.replace(/\b[a-z]/g, function (letter) { return letter.toUpperCase(); });
    }

    function appendLabelValue(parent, label, value) {
        const p = node('p', null, 'mb-1');
        const strong = node('strong', label + ': ');
        p.appendChild(strong);
        p.appendChild(document.createTextNode(value === null || value === undefined || value === '' ? '—' : String(value)));
        parent.appendChild(p);
    }

    function renderOrders(orders) {
        if (!orderRegion) return;
        orderRegion.replaceChildren();
        if (!orders || !orders.length) {
            orderRegion.appendChild(node('p', 'No order is created by cart yet.', 'text-muted mb-0'));
            return;
        }
        const list = node('div');
        orders.forEach(function (order) {
            const card = node('article', null, 'border rounded p-3 mb-3');
            const heading = node('h4', order.order_reference ? 'Order ' + order.order_reference : 'Order ' + order.id, 'h6 mb-2');
            card.appendChild(heading);
            appendLabelValue(card, 'Order status', humanizeStatus(order.order_status));
            appendLabelValue(card, 'Payment status', humanizeStatus(order.payment_status));
            appendLabelValue(card, 'Total', money(order.total_kes, order.currency_code || 'KES'));
            appendLabelValue(card, 'Placed', dateText(order.created_at));

            const items = Array.isArray(order.order_items) ? order.order_items : [];
            if (items.length) {
                card.appendChild(node('h5', 'Items', 'small font-weight-bold mt-3 mb-1'));
                const itemList = node('ul', null, 'small pl-3 mb-2');
                items.forEach(function (item) {
                    const quantity = Number(item.quantity);
                    const prefix = Number.isFinite(quantity) ? quantity + ' × ' : '';
                    itemList.appendChild(node('li', prefix + (item.product_name || 'Item') + ' — ' + money(item.line_total_kes, order.currency_code || 'KES')));
                });
                card.appendChild(itemList);
            }
            const payments = Array.isArray(order.payment_transactions) ? order.payment_transactions : [];
            if (payments.length) {
                card.appendChild(node('h5', 'Payment activity', 'small font-weight-bold mt-3 mb-1'));
                const paymentList = node('ul', null, 'small pl-3 mb-2');
                payments.forEach(function (payment) {
                    paymentList.appendChild(node('li', humanizeStatus(payment.status) + ' — ' + money(payment.amount_kes, order.currency_code || 'KES') + ' — ' + dateText(payment.created_at)));
                });
                card.appendChild(paymentList);
            }
            const history = Array.isArray(order.order_status_history) ? order.order_status_history : [];
            if (history.length) {
                card.appendChild(node('h5', 'Status history', 'small font-weight-bold mt-3 mb-1'));
                const historyList = node('ul', null, 'small pl-3 mb-0');
                history.forEach(function (entry) {
                    historyList.appendChild(node('li', humanizeStatus(entry.previous_status || 'created') + ' → ' + humanizeStatus(entry.new_status) + ' — ' + dateText(entry.created_at)));
                });
                card.appendChild(historyList);
            }
            list.appendChild(card);
        });
        orderRegion.appendChild(list);
    }

    async function loadOrders(user, version) {
        if (!orderRegion || !supabase || !user) return;
        orderRegion.replaceChildren(node('p', 'Loading your orders…', 'text-muted mb-0'));
        try {
            const result = await supabase.from('orders')
                .select('id,order_reference,order_status,payment_status,total_kes,currency_code,created_at,order_items(id,product_name,quantity,line_total_kes),payment_transactions(id,status,amount_kes,created_at),order_status_history(id,previous_status,new_status,created_at)')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);
            if (result.error) throw result.error;
            if (version !== loadVersion) return;
            renderOrders(result.data || []);
        } catch (error) {
            if (version === loadVersion) orderRegion.replaceChildren(node('p', 'Could not load order history: ' + errorText(error), 'text-danger mb-0'));
        }
    }

    async function loadUserData(user) {
        const version = ++loadVersion;
        activeUser = user || null;
        if (!activeUser) {
            if (nameInput) nameInput.value = '';
            if (telephoneInput) telephoneInput.value = '';
            if (currentEmailInput) currentEmailInput.value = '';
            status(profileStatus, 'Sign in to view and update your account details.', 'info');
            if (orderRegion) orderRegion.replaceChildren(node('p', 'Sign in to view your order history.', 'text-muted mb-0'));
            return;
        }
        if (currentEmailInput) currentEmailInput.value = activeUser.email || '';
        status(profileStatus, 'Loading your saved details…', 'info');
        try {
            const profileResult = await supabase.from('customer_profiles')
                .select('full_name,telephone')
                .eq('user_id', activeUser.id)
                .maybeSingle();
            if (profileResult.error) throw profileResult.error;
            if (version !== loadVersion) return;
            const profile = profileResult.data || {};
            if (nameInput) nameInput.value = profile.full_name || (activeUser.user_metadata && activeUser.user_metadata.full_name) || '';
            if (telephoneInput) telephoneInput.value = profile.telephone || '';
            status(profileStatus, 'Your details are ready.', 'success');
            if (!profileAnchorHandled && window.location && window.location.hash === '#profile') {
                profileAnchorHandled = true;
                window.setTimeout(function () {
                    const profileCard = document.querySelector('#profile');
                    if (profileCard && typeof profileCard.scrollIntoView === 'function') profileCard.scrollIntoView({ block: 'start' });
                }, 0);
            }
            await loadOrders(activeUser, version);
        } catch (error) {
            if (version !== loadVersion) return;
            status(profileStatus, 'Could not load your saved details: ' + errorText(error), 'error');
            if (orderRegion) orderRegion.replaceChildren(node('p', 'Could not load your order history. Please refresh and try again.', 'text-danger mb-0'));
        }
    }

    async function initialize(client) {
        supabase = client;
        if (!supabase) {
            status(profileStatus, 'Account services are not connected. Your details were not loaded or saved.', 'error');
            if (orderRegion) orderRegion.replaceChildren(node('p', 'Order history is not available because account services are not connected.', 'text-danger mb-0'));
            return;
        }
        try {
            const result = await supabase.auth.getSession();
            if (result.error) throw result.error;
            const session = result.data && result.data.session;
            await loadUserData(session && session.user);
            if (supabase.auth.onAuthStateChange) supabase.auth.onAuthStateChange(function (event, nextSession) {
                if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                    window.setTimeout(function () { loadUserData(nextSession && nextSession.user); }, 0);
                }
            });
        } catch (error) {
            status(profileStatus, 'Could not load your saved details: ' + errorText(error), 'error');
            if (orderRegion) orderRegion.replaceChildren(node('p', 'Could not load your order history. Please refresh and try again.', 'text-danger mb-0'));
        }
    }

    if (profileForm) profileForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (!activeUser || !supabase) {
            status(profileStatus, 'Sign in before saving your details.', 'error');
            return;
        }
        if (!profileForm.reportValidity()) return;
        const fullName = String(nameInput.value || '').trim();
        const telephone = String(telephoneInput.value || '').trim();
        if (!fullName) {
            status(profileStatus, 'Enter your full name.', 'error');
            nameInput.focus();
            return;
        }
        busy(profileForm, true);
        status(profileStatus, 'Saving your details…', 'info');
        try {
            const result = await supabase.from('customer_profiles').upsert({
                user_id: activeUser.id,
                full_name: fullName,
                telephone: telephone
            }, { onConflict: 'user_id' });
            if (result.error) throw result.error;
            status(profileStatus, 'Your details were saved.', 'success');
        } catch (error) {
            status(profileStatus, 'Could not save your details: ' + errorText(error), 'error');
        } finally {
            busy(profileForm, false);
        }
    });

    if (emailForm) emailForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (!activeUser || !supabase) {
            status(emailStatus, 'Sign in before requesting an email change.', 'error');
            return;
        }
        if (!emailForm.reportValidity()) return;
        const email = String(new FormData(emailForm).get('email') || '').trim();
        if (!email) return;
        busy(emailForm, true);
        status(emailStatus, 'Requesting email change…', 'info');
        try {
            const result = await supabase.auth.updateUser({ email: email });
            if (result.error) throw result.error;
            status(emailStatus, 'Email-change request submitted. Check the new address for Supabase Auth’s verification link; the current sign-in email remains active until verification.', 'success');
        } catch (error) {
            status(emailStatus, 'Could not request the email change: ' + errorText(error), 'error');
        } finally {
            busy(emailForm, false);
        }
    });

    if (api.backendReady && typeof api.backendReady.then === 'function') {
        api.backendReady.then(initialize).catch(function () {
            status(profileStatus, 'Account services could not be initialized. Please refresh and try again.', 'error');
            if (orderRegion) orderRegion.replaceChildren(node('p', 'Order history could not be initialized. Please refresh and try again.', 'text-danger mb-0'));
        });
    } else {
        initialize(null);
    }
}(window, document));
