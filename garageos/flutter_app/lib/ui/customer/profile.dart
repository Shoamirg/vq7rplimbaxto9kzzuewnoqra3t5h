import 'package:flutter/material.dart';

import '../../app_state.dart';
import '../../data/api_client.dart';
import '../../data/customer_portal.dart';
import '../../domain/portal.dart';
import '../../design/theme.dart';
import '../../design/widgets.dart';
import '../../l10n/l10n.dart';
import '../chat.dart';
import '../settings.dart';

class ProfileTab extends StatelessWidget {
  const ProfileTab({
    super.key,
    required this.portal,
    required this.state,
    required this.onLogout,
  });
  final CustomerPortal portal;
  final AppState state;
  final VoidCallback onLogout;

  Future<void> deleteAccount(BuildContext context) async {
    final yes = await confirmSheet(
      context,
      title: context.l10n.deleteAccountTitle,
      message: context.l10n.deleteAccountHint,
      confirmLabel: context.l10n.deleteAccount,
      icon: Icons.delete_outline,
    );
    if (!yes || !context.mounted) return;
    try {
      await portal.deleteAccount();
      onLogout();
    } catch (e) {
      if (context.mounted) toast(context, context.message(failureText(e)));
    }
  }

  @override
  Widget build(BuildContext context) => LoadView<CustomerProfile>(
    loadKey: portal,
    load: portal.profile,
    builder: (profile, reload) {
      final p = context.colors;
      final garage = profile.garage;
      return ListView(
        padding: const EdgeInsets.all(Space.page),
        children: [
          Semantics(
            header: true,
            child: Text(
              context.l10n.profile,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
          ),
          const SizedBox(height: Space.grid),
          BentoCard(
            child: Row(
              children: [
                Initials(profile.name, size: 64),
                const SizedBox(width: Space.grid),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        profile.name,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      if (profile.phone != null)
                        Text(
                          formatPhone(profile.phone!),
                          style: context.mono(color: p.secondary),
                        ),
                      if (profile.email != null)
                        Text(
                          profile.email!,
                          style: TextStyle(color: p.secondary),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          SectionTitle(context.l10n.myGarage),
          BentoCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    IconSquare(Icons.home_repair_service_outlined),
                    const SizedBox(width: Space.md),
                    Expanded(
                      child: Text(
                        garage.name,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: Space.md),
                if (garage.address != null)
                  InfoLine(icon: Icons.place_outlined, text: garage.address!),
                if (garage.hours != null)
                  InfoLine(icon: Icons.schedule, text: garage.hours!, mono: true),
                if (garage.phone != null) ...[
                  InfoLine(
                    icon: Icons.call_outlined,
                    text: formatPhone(garage.phone!),
                    mono: true,
                  ),
                  const SizedBox(height: Space.md),
                  PillButton(
                    label: context.l10n.callGarage,
                    icon: Icons.call,
                    kind: PillKind.secondary,
                    expand: true,
                    onPressed: () => callNumber(context, garage.phone!),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: Space.grid),
          BentoCard(
            padding: const EdgeInsets.symmetric(vertical: Space.sm),
            child: Column(
              children: [
                _Action(
                  icon: Icons.password,
                  label: context.l10n.changePassword,
                  onTap: () => showModalBottomSheet<void>(
                    context: context,
                    isScrollControlled: true,
                    builder: (_) => _ChangePasswordSheet(portal: portal),
                  ),
                ),
                _Action(
                  icon: Icons.settings_outlined,
                  label: context.l10n.settings,
                  onTap: () => openPage(
                    context,
                    SettingsScreen(
                      state: state,
                      onLogout: onLogout,
                      pushed: true,
                    ),
                  ),
                ),
                _Action(
                  icon: Icons.logout,
                  label: context.l10n.signOut,
                  onTap: () async {
                    final yes = await confirmSheet(
                      context,
                      title: context.l10n.signOutTitle,
                      message: portal.isDemo
                          ? context.l10n.demoSignOut
                          : context.l10n.confirmSignOut,
                      confirmLabel: context.l10n.signOut,
                      icon: Icons.logout,
                    );
                    if (yes) onLogout();
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: Space.group),
          PillButton(
            label: context.l10n.deleteAccount,
            icon: Icons.delete_outline,
            kind: PillKind.danger,
            expand: true,
            onPressed: () => deleteAccount(context),
          ),
        ],
      );
    },
  );
}


class _Action extends StatelessWidget {
  const _Action({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => ListTile(
    minTileHeight: 60,
    contentPadding: const EdgeInsets.symmetric(horizontal: Space.card),
    leading: Icon(icon, color: context.colors.secondary),
    title: Text(label),
    trailing: const Icon(Icons.chevron_right),
    onTap: onTap,
  );
}

class _ChangePasswordSheet extends StatefulWidget {
  const _ChangePasswordSheet({required this.portal});
  final CustomerPortal portal;
  @override
  State<_ChangePasswordSheet> createState() => _ChangePasswordSheetState();
}

class _ChangePasswordSheetState extends State<_ChangePasswordSheet> {
  final form = GlobalKey<FormState>();
  final current = TextEditingController(), next = TextEditingController();
  bool busy = false;
  Object? failure;
  @override
  void dispose() {
    current.dispose();
    next.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (!validateForm(form)) return;
    setState(() {
      busy = true;
      failure = null;
    });
    try {
      await widget.portal.changePassword(current.text, next.text);
      if (!mounted) return;
      toast(context, context.l10n.passwordUpdated);
      Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => failure = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
    child: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Space.page, 0, Space.page, Space.page),
        child: Form(
          key: form,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                context.l10n.changePassword,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: Space.md),
              if (failure != null) ...[
                failureView(context, failure!),
                const SizedBox(height: Space.md),
              ],
              TextFormField(
                controller: current,
                obscureText: true,
                enabled: !busy,
                decoration: InputDecoration(labelText: context.l10n.currentPassword),
                validator: (s) => (s?.isEmpty ?? true)
                    ? context.l10n.requiredField
                    : null,
              ),
              const SizedBox(height: Space.md),
              TextFormField(
                controller: next,
                obscureText: true,
                enabled: !busy,
                autofillHints: const [AutofillHints.newPassword],
                decoration: InputDecoration(
                  labelText: context.l10n.newPassword,
                  helperText: context.l10n.passwordRule,
                ),
                validator: (s) => (s?.length ?? 0) >= 10
                    ? null
                    : context.l10n.passwordRule,
              ),
              const SizedBox(height: Space.group),
              SaveButton(
                label: context.l10n.save,
                busy: busy,
                onPressed: save,
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
