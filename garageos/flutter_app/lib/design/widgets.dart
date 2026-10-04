import 'dart:async';

import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../domain/models.dart';
import 'theme.dart';
import '../l10n/l10n.dart';
import '../ui/settings.dart';

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
          : Duration(milliseconds: 150),
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
    this.readOnly = false,
    this.hasChanges = false,
    this.isSaving = false,
  });
  final String title;
  final Widget body;
  final Widget? footer;
  final List<Widget>? actions;
  final bool demo;
  final bool readOnly;
  final bool hasChanges, isSaving;
  @override
  Widget build(BuildContext context) => LeaveGuard(
    hasChanges: hasChanges,
    isSaving: isSaving,
    child: Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: [...?actions, const LanguageMenu()],
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (demo) const DemoNotice(),
            if (readOnly) const ReadOnlyNotice(),
            Expanded(
              child: Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: Space.contentWidth),
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
              child: Padding(padding: EdgeInsets.all(16), child: footer),
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
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(context.l10n.savingHint)));
      return;
    }
    asking = true;
    final discard = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.l10n.unsavedChanges),
        content: Text(context.l10n.discardHint),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(context.l10n.continueEditing),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(context.l10n.discardChanges),
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
    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
    child: Text(
      context.l10n.demoNotice,
      style: Theme.of(context).textTheme.bodySmall
          ?.copyWith(color: context.colors.info),
    ),
  );
}

class ReadOnlyNotice extends StatelessWidget {
  const ReadOnlyNotice({super.key});
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    color: context.colors.infoSoft,
    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
    child: Text(
      context.l10n.readOnlyNotice,
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
      label: context.l10n.plateSemantics(
        display.isEmpty ? context.l10n.absent : display,
      ),
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: context.colors.surface,
          border: Border.all(color: context.colors.border),
          borderRadius: BorderRadius.circular(Radii.plate),
        ),
        child: Text(
          display.isEmpty ? context.l10n.noPlate : display,
          style: Theme.of(context).textTheme.labelMedium,
        ),
      ),
    );
  }
}

class StatusBadge extends StatelessWidget {
  const StatusBadge(this.label, {super.key, this.tone = 'info', this.icon});
  final String label, tone;
  final IconData? icon;
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
      padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(Radii.control),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 16, color: fg),
            SizedBox(width: Space.xs),
          ],
          Flexible(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: fg),
            ),
          ),
        ],
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
    child: Padding(padding: EdgeInsets.all(16), child: child),
  );
}

class ErrorNotice extends StatelessWidget {
  const ErrorNotice(this.message, {super.key, this.retry});
  final String message;
  final VoidCallback? retry;
  @override
  Widget build(BuildContext context) => Container(
    padding: EdgeInsets.all(16),
    margin: EdgeInsets.only(bottom: 16),
    decoration: BoxDecoration(
      color: context.colors.dangerSoft,
      borderRadius: BorderRadius.circular(Radii.card),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          liveRegion: true,
          child: Text(
            context.message(message),
            style: TextStyle(color: context.colors.danger),
          ),
        ),
        if (retry != null)
          TextButton(onPressed: retry, child: Text(context.l10n.retry)),
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
    this.action,
  });
  final String title, detail;
  final IconData icon;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.symmetric(vertical: 40, horizontal: 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 40, color: context.colors.secondary),
        SizedBox(height: 16),
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        SizedBox(height: 8),
        Text(detail),
        if (action != null) ...[SizedBox(height: Space.md), action!],
      ],
    ),
  );
}

class LoadView<T> extends StatefulWidget {
  const LoadView({
    super.key,
    required this.loadKey,
    required this.load,
    required this.builder,
  });
  final Object loadKey;
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
    if (oldWidget.loadKey != widget.loadKey) {
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
        return Center(child: CircularProgressIndicator());
      }
      if (snapshot.hasError) {
        return ListView(
          padding: EdgeInsets.all(20),
          children: [ErrorNotice(failureText(snapshot.error!), retry: reload)],
        );
      }
      return widget.builder(snapshot.data as T, reload);
    },
  );
}

/// List controls stay available while results are loading or unavailable.
class ListLoadView<T> extends StatefulWidget {
  const ListLoadView({
    super.key,
    required this.loadKey,
    required this.filterKey,
    required this.load,
    required this.header,
    required this.items,
    required this.storageKey,
  });
  final Object loadKey;
  final Object filterKey;
  final Future<T> Function() load;
  final List<Widget> Function(T? data, VoidCallback reload, bool loading)
  header;
  final List<Widget> Function(T data, VoidCallback reload) items;
  final String storageKey;

  @override
  State<ListLoadView<T>> createState() => _ListLoadViewState<T>();
}

class _ListLoadViewState<T> extends State<ListLoadView<T>> {
  late Future<T> future;
  T? previousData;
  final scroll = ScrollController();

  Future<T> load() {
    late final Future<T> request;
    request = Future<T>.sync(widget.load).then((data) {
      if (mounted && identical(future, request)) previousData = data;
      return data;
    });
    return request;
  }

  @override
  void initState() {
    super.initState();
    future = load();
  }

  @override
  void didUpdateWidget(covariant ListLoadView<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.filterKey != widget.filterKey) {
      previousData = null;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && scroll.hasClients) scroll.jumpTo(0);
      });
    }
    if (oldWidget.loadKey != widget.loadKey) future = load();
  }

  @override
  void dispose() {
    scroll.dispose();
    super.dispose();
  }

  void reload() {
    setState(() {
      future = load();
    });
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<T>(
    future: future,
    builder: (context, snapshot) {
      final loading = snapshot.connectionState != ConnectionState.done;
      final data = !loading && !snapshot.hasError ? snapshot.data : null;
      return ListView(
        key: PageStorageKey(widget.storageKey),
        controller: scroll,
        padding: EdgeInsets.all(Space.page),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          ...widget.header(data, reload, loading),
          if (snapshot.hasError)
            ErrorNotice(failureText(snapshot.error!), retry: reload),
          if (snapshot.hasError && previousData != null)
            Padding(
              padding: EdgeInsets.only(bottom: Space.md),
              child: Text(context.l10n.previousListHint),
            ),
          if ((loading || snapshot.hasError) && previousData != null)
            Stack(
              children: [
                IgnorePointer(
                  child: ExcludeSemantics(
                    child: Opacity(
                      opacity: .55,
                      child: Column(
                        children: widget.items(previousData as T, reload),
                      ),
                    ),
                  ),
                ),
                if (loading)
                  Positioned(
                    top: 0,
                    left: 0,
                    right: 0,
                    child: LinearProgressIndicator(
                      semanticsLabel: context.l10n.loading,
                    ),
                  ),
              ],
            )
          else if (loading)
            Padding(
              padding: EdgeInsets.symmetric(vertical: Space.group),
              child: LinearProgressIndicator(
                semanticsLabel: context.l10n.loading,
              ),
            )
          else if (!snapshot.hasError)
            ...widget.items(snapshot.data as T, reload),
        ],
      );
    },
  );
}

class ListSearchField extends StatefulWidget {
  const ListSearchField({
    super.key,
    required this.controller,
    required this.label,
    required this.hint,
    required this.onSearch,
  });
  final TextEditingController controller;
  final String label, hint;
  final ValueChanged<String> onSearch;
  @override
  State<ListSearchField> createState() => _ListSearchFieldState();
}

class _ListSearchFieldState extends State<ListSearchField> {
  Timer? debounce;
  void submit(String value) {
    debounce?.cancel();
    widget.onSearch(value.trim());
  }

  @override
  void dispose() {
    debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      ValueListenableBuilder<TextEditingValue>(
        valueListenable: widget.controller,
        builder: (context, value, _) => TextField(
          controller: widget.controller,
          decoration: InputDecoration(
            labelText: widget.label,
            hintText: widget.hint,
            prefixIcon: Icon(Icons.search),
            suffixIcon: value.text.isEmpty
                ? null
                : IconButton(
                    tooltip: context.l10n.clearSearch,
                    onPressed: () {
                      widget.controller.clear();
                      submit('');
                    },
                    icon: Icon(Icons.close),
                  ),
          ),
          textInputAction: TextInputAction.search,
          onSubmitted: submit,
          onChanged: (text) {
            debounce?.cancel();
            debounce = Timer(Duration(milliseconds: 350), () {
              if (widget.controller.text == text &&
                  widget.controller.value.composing.isCollapsed) {
                submit(text);
              }
            });
          },
        ),
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
        ? SizedBox(
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
    padding: EdgeInsets.symmetric(vertical: 8),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(label, style: TextStyle(color: context.colors.secondary)),
        ),
        SizedBox(width: 12),
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
