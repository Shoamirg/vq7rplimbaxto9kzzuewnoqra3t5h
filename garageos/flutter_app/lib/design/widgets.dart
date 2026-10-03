import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../domain/models.dart';
import 'theme.dart';

bool validateForm(GlobalKey<FormState> key) {
  final form = key.currentState;
  if (form == null) return false;
  final invalid = form.validateGranularly();
  if (invalid.isEmpty) return true;
  WidgetsBinding.instance.addPostFrameCallback((_) {
    final field = invalid.first;
    if (!field.mounted) return;
    final candidates = FocusScope.of(field.context).traversalDescendants
        .where((node) {
          var inside = false;
          node.context?.visitAncestorElements((element) {
            if (element == field.context) inside = true;
            return !inside;
          });
          return inside && node.canRequestFocus;
        })
        .toList();
    final textNodes = candidates.where(
      (node) =>
          node.context?.findAncestorStateOfType<EditableTextState>() != null,
    );
    if (textNodes.isNotEmpty) {
      textNodes.first.requestFocus();
    } else if (candidates.isNotEmpty) {
      candidates.first.requestFocus();
    }
    Scrollable.ensureVisible(
      field.context,
      alignment: .2,
      duration: MediaQuery.disableAnimationsOf(field.context)
          ? Duration.zero
          : const Duration(milliseconds: 150),
    );
  });
  return false;
}

Future<T?> openPage<T>(BuildContext context, Widget page) =>
    Navigator.of(context).push<T>(
      MediaQuery.disableAnimationsOf(context)
          ? PageRouteBuilder<T>(
              pageBuilder: (_, _, _) => page,
              transitionDuration: Duration.zero,
              reverseTransitionDuration: Duration.zero,
            )
          : MaterialPageRoute<T>(builder: (_) => page),
    );

class PageFrame extends StatelessWidget {
  const PageFrame({
    super.key,
    required this.title,
    required this.body,
    this.footer,
    this.actions,
    this.demo = false,
    this.hasChanges = false,
    this.isSaving = false,
  });
  final String title;
  final Widget body;
  final Widget? footer;
  final List<Widget>? actions;
  final bool demo;
  final bool hasChanges, isSaving;
  @override
  Widget build(BuildContext context) => LeaveGuard(
    hasChanges: hasChanges,
    isSaving: isSaving,
    child: Scaffold(
      appBar: AppBar(title: Text(title), actions: actions),
      body: SafeArea(
        child: Column(
          children: [
            if (demo) const DemoNotice(),
            Expanded(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                    maxWidth: Space.contentWidth,
                  ),
                  child: body,
                ),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: footer == null
          ? null
          : SafeArea(
              child: Padding(padding: const EdgeInsets.all(16), child: footer),
            ),
    ),
  );
}

/// User back/cancel navigation is guarded; successful saves use Navigator.pop
/// with their result and can leave immediately.
class LeaveGuard extends StatefulWidget {
  const LeaveGuard({
    super.key,
    required this.child,
    required this.hasChanges,
    required this.isSaving,
  });
  final Widget child;
  final bool hasChanges, isSaving;
  @override
  State<LeaveGuard> createState() => _LeaveGuardState();
}

class _LeaveGuardState extends State<LeaveGuard> {
  bool asking = false;
  Future<void> attempted(bool didPop, Object? result) async {
    if (didPop || asking) return;
    if (widget.isSaving) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saqlanmoqda… natijani kuting.')),
      );
      return;
    }
    asking = true;
    final discard = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Oʻzgarishlar saqlanmadi'),
        content: const Text(
          'Sahifadan chiqsangiz kiritilgan yozuvlar yoʻqoladi.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Davom etish'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Saqlamasdan chiqish'),
          ),
        ],
      ),
    );
    asking = false;
    if (discard == true && mounted && !widget.isSaving) {
      Navigator.pop(context, result);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope<Object?>(
    canPop: !widget.hasChanges && !widget.isSaving,
    onPopInvokedWithResult: attempted,
    child: widget.child,
  );
}

class DemoNotice extends StatelessWidget {
  const DemoNotice({super.key});
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    color: context.colors.infoSoft,
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
    child: Text(
      'Demo maʼlumotlar · chiqishda tiklanadi',
      style: Theme.of(context).textTheme.bodySmall
          ?.copyWith(color: context.colors.info),
    ),
  );
}

class Plate extends StatelessWidget {
  const Plate(this.value, {super.key});
  final String? value;
  @override
  Widget build(BuildContext context) {
    final text = value?.replaceAll(RegExp(r'[\s-]'), '').toUpperCase() ?? '';
    final match = RegExp(r'^(\d{2})([A-Z])(\d{3})([A-Z]{2})$').firstMatch(text);
    final display = match == null
        ? text
        : '${match[1]} ${match[2]} ${match[3]} ${match[4]}';
    return Semantics(
      label: 'Davlat raqami: ${display.isEmpty ? 'yoʻq' : display}',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: context.colors.surface,
          border: Border.all(color: context.colors.border),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Text(
          display.isEmpty ? 'Raqam yoʻq' : display,
          style: Theme.of(context).textTheme.labelMedium,
        ),
      ),
    );
  }
}

class StatusBadge extends StatelessWidget {
  const StatusBadge(this.label, {super.key, this.tone = 'info'});
  final String label, tone;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final (fg, bg) = switch (tone) {
      'success' => (p.success, p.successSoft),
      'warning' => (p.warning, p.warningSoft),
      'danger' => (p.danger, p.dangerSoft),
      _ => (p.info, p.infoSoft),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: fg),
      ),
    );
  }
}

String workTone(WorkStatus status) => switch (status) {
  WorkStatus.pending => 'warning',
  WorkStatus.completed => 'success',
  WorkStatus.cancelled => 'danger',
  _ => 'info',
};

class Panel extends StatelessWidget {
  const Panel({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(padding: const EdgeInsets.all(16), child: child),
  );
}

class ErrorNotice extends StatelessWidget {
  const ErrorNotice(this.message, {super.key, this.retry});
  final String message;
  final VoidCallback? retry;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    margin: const EdgeInsets.only(bottom: 16),
    decoration: BoxDecoration(
      color: context.colors.dangerSoft,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          liveRegion: true,
          child: Text(message, style: TextStyle(color: context.colors.danger)),
        ),
        if (retry != null)
          TextButton(onPressed: retry, child: const Text('Qayta urinish')),
      ],
    ),
  );
}

class EmptyNotice extends StatelessWidget {
  const EmptyNotice(
    this.title,
    this.detail, {
    super.key,
    this.icon = Icons.inbox_outlined,
  });
  final String title, detail;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 16),
    child: Column(
      children: [
        Icon(icon, size: 40, color: context.colors.secondary),
        const SizedBox(height: 16),
        Text(
          title,
          style: Theme.of(context).textTheme.titleMedium,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(detail, textAlign: TextAlign.center),
      ],
    ),
  );
}

class LoadView<T> extends StatefulWidget {
  const LoadView({super.key, required this.load, required this.builder});
  final Future<T> Function() load;
  final Widget Function(T data, VoidCallback reload) builder;
  @override
  State<LoadView<T>> createState() => _LoadViewState<T>();
}

class _LoadViewState<T> extends State<LoadView<T>> {
  late Future<T> future;
  @override
  void initState() {
    super.initState();
    future = widget.load();
  }

  @override
  void didUpdateWidget(covariant LoadView<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.load != widget.load) {
      future = widget.load();
    }
  }

  void reload() {
    if (mounted) {
      setState(() {
        future = widget.load();
      });
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<T>(
    future: future,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Center(child: CircularProgressIndicator());
      }
      if (snapshot.hasError) {
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [ErrorNotice(failureText(snapshot.error!), retry: reload)],
        );
      }
      return widget.builder(snapshot.data as T, reload);
    },
  );
}

class SaveButton extends StatelessWidget {
  const SaveButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.busy = false,
  });
  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  @override
  Widget build(BuildContext context) => FilledButton(
    onPressed: busy ? null : onPressed,
    child: busy
        ? const SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : Text(label),
  );
}

class Pair extends StatelessWidget {
  const Pair(this.label, this.value, {super.key, this.emphasis = false});
  final String label, value;
  final bool emphasis;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(label, style: TextStyle(color: context.colors.secondary)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: emphasis ? Theme.of(context).textTheme.titleMedium : null,
          ),
        ),
      ],
    ),
  );
}
