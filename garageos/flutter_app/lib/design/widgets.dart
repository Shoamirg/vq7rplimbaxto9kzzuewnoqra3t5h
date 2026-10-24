import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../data/api_client.dart';
import '../domain/models.dart';
import 'bento.dart';
import 'states.dart';
import 'theme.dart';
import '../l10n/l10n.dart';
import '../ui/settings.dart';

export 'bento.dart';
export 'states.dart';

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

/// Pushed screen: flat app bar on the canvas, centred content column and an
/// optional floating footer (pill or sticky action bar).
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
    this.language = true,
    this.footerPadding = true,
  });
  final String title;
  final Widget body;
  final Widget? footer;
  final List<Widget>? actions;
  final bool demo;
  final bool readOnly;
  final bool hasChanges, isSaving;
  final bool language;

  /// Sticky action bars bring their own floating margins.
  final bool footerPadding;
  @override
  Widget build(BuildContext context) => LeaveGuard(
    hasChanges: hasChanges,
    isSaving: isSaving,
    child: Scaffold(
      appBar: AppBar(
        title: Text(title, maxLines: 2),
        backgroundColor: context.colors.background,
        shape: const RoundedRectangleBorder(),
        actions: [...?actions, if (language) const LanguageMenu()],
      ),
      body: SafeArea(
        bottom: footer == null,
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
          : footerPadding
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: footer,
              ),
            )
          : footer,
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
    final discard = await confirmSheet(
      context,
      title: context.l10n.unsavedChanges,
      message: context.l10n.discardHint,
      confirmLabel: context.l10n.discardChanges,
      cancelLabel: context.l10n.continueEditing,
    );
    asking = false;
    if (discard && mounted && !widget.isSaving) {
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

class _Notice extends StatelessWidget {
  const _Notice(this.text, this.icon);
  final String text;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    margin: const EdgeInsets.fromLTRB(16, 4, 16, 4),
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
    decoration: BoxDecoration(
      color: context.colors.infoSoft,
      borderRadius: BorderRadius.circular(Radii.control),
      border: Border.all(color: context.colors.border),
    ),
    child: Row(
      children: [
        Icon(icon, size: 16, color: context.colors.info),
        const SizedBox(width: Space.sm),
        Expanded(
          child: Text(
            text,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: context.colors.info),
          ),
        ),
      ],
    ),
  );
}

class DemoNotice extends StatelessWidget {
  const DemoNotice({super.key});
  @override
  Widget build(BuildContext context) =>
      _Notice(context.l10n.demoNotice, Icons.science_outlined);
}

class ReadOnlyNotice extends StatelessWidget {
  const ReadOnlyNotice({super.key});
  @override
  Widget build(BuildContext context) =>
      _Notice(context.l10n.readOnlyNotice, Icons.visibility_outlined);
}

String formatPlate(String? value) {
  final text = value?.replaceAll(RegExp(r'[\s-]'), '').toUpperCase() ?? '';
  final match = RegExp(r'^(\d{2})([A-Z])(\d{3})([A-Z]{2})$').firstMatch(text);
  return match == null
      ? text
      : '${match[1]} ${match[2]} ${match[3]} ${match[4]}';
}

class Plate extends StatelessWidget {
  const Plate(this.value, {super.key, this.inverse = false, this.size = 14});
  final String? value;
  final bool inverse;
  final double size;
  @override
  Widget build(BuildContext context) {
    final display = formatPlate(value);
    return MonoBadge(
      display.isEmpty ? context.l10n.noPlate : display,
      inverse: inverse,
      size: size,
      semanticLabel: context.l10n.plateSemantics(
        display.isEmpty ? context.l10n.absent : display,
      ),
    );
  }
}

/// Status chips always pair colour with an icon and a text label.
class StatusBadge extends StatelessWidget {
  const StatusBadge(
    this.label, {
    super.key,
    this.tone = 'info',
    this.icon,
    this.large = false,
  });
  final String label, tone;
  final IconData? icon;
  final bool large;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final (fg, bg) = switch (tone) {
      'success' => (p.success, p.successSoft),
      'warning' => (p.warning, p.warningSoft),
      'danger' => (p.danger, p.dangerSoft),
      'strong' => (p.onBrand, p.brand),
      'neutral' => (p.text, p.muted),
      _ => (p.info, p.infoSoft),
    };
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: large ? 14 : 10,
        vertical: large ? 8 : 4,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(Radii.control),
        border: tone == 'neutral' ? Border.all(color: p.border) : null,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: large ? 20 : 16, color: fg),
            SizedBox(width: Space.xs + 2),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 2,
              style:
                  (large
                          ? Theme.of(context).textTheme.labelLarge
                          : Theme.of(context).textTheme.bodySmall)
                      ?.copyWith(color: fg, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

String workTone(WorkStatus status) => switch (status) {
  WorkStatus.pending || WorkStatus.rescheduled => 'warning',
  WorkStatus.confirmed => 'neutral',
  WorkStatus.inProgress => 'strong',
  WorkStatus.completed => 'success',
  WorkStatus.cancelled => 'danger',
  WorkStatus.unknown => 'info',
};

IconData workIcon(WorkStatus status) => switch (status) {
  WorkStatus.pending => Icons.schedule,
  WorkStatus.confirmed => Icons.event_available_outlined,
  WorkStatus.inProgress => Icons.build_outlined,
  WorkStatus.completed => Icons.check_circle_outline,
  WorkStatus.cancelled => Icons.cancel_outlined,
  WorkStatus.rescheduled => Icons.event_repeat,
  WorkStatus.unknown => Icons.help_outline,
};

class WorkStatusChip extends StatelessWidget {
  const WorkStatusChip(this.status, {super.key, this.large = false});
  final WorkStatus status;
  final bool large;
  @override
  Widget build(BuildContext context) => StatusBadge(
    context.message(status.label),
    tone: workTone(status),
    icon: workIcon(status),
    large: large,
  );
}

String billTone(String status) => switch (status) {
  'paid' => 'success',
  'overdue' || 'void' => 'danger',
  'draft' => 'neutral',
  _ => 'warning',
};

IconData billIcon(String status) => switch (status) {
  'paid' => Icons.check_circle_outline,
  'overdue' => Icons.error_outline,
  'void' => Icons.cancel_outlined,
  'partial' => Icons.timelapse,
  'draft' => Icons.edit_note,
  _ => Icons.receipt_long_outlined,
};

class BillStatusChip extends StatelessWidget {
  const BillStatusChip(this.status, {super.key});
  final String status;
  @override
  Widget build(BuildContext context) => StatusBadge(
    context.message(billStatusLabel(status)),
    tone: billTone(status),
    icon: billIcon(status),
  );
}

class Panel extends StatelessWidget {
  const Panel({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) =>
      BentoCard(padding: const EdgeInsets.all(Space.tile), child: child);
}

class ErrorNotice extends StatelessWidget {
  const ErrorNotice(this.message, {super.key, this.retry});
  final String message;
  final VoidCallback? retry;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: ErrorState(message, retry: retry),
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
  Widget build(BuildContext context) =>
      EmptyState(icon: icon, title: title, detail: detail, action: action);
}

typedef Reload = Future<void> Function();

/// One record or composite view: skeleton, failure, offline cache, data.
class LoadView<T> extends StatefulWidget {
  const LoadView({
    super.key,
    required this.loadKey,
    required this.load,
    required this.builder,
    this.skeleton = SkeletonLayout.detail,
    this.unavailableAction,
  });
  final Object loadKey;
  final Future<T> Function() load;
  final Widget Function(T data, Reload reload) builder;
  final SkeletonLayout skeleton;
  final Widget? unavailableAction;
  @override
  State<LoadView<T>> createState() => _LoadViewState<T>();
}

class _LoadViewState<T> extends State<LoadView<T>> {
  late Future<T> future;
  T? cached;
  bool hasCache = false;

  Future<T> start() {
    late final Future<T> request;
    request = Future<T>.sync(widget.load).then((data) {
      if (mounted && identical(future, request)) {
        cached = data;
        hasCache = true;
      }
      return data;
    });
    return request;
  }

  @override
  void initState() {
    super.initState();
    future = start();
  }

  @override
  void didUpdateWidget(covariant LoadView<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.loadKey != widget.loadKey) future = start();
  }

  Future<void> reload() async {
    if (!mounted) return;
    final next = start();
    setState(() {
      future = next;
    });
    try {
      await next;
    } catch (_) {
      // The builder renders the failure.
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<T>(
    future: future,
    builder: (context, snapshot) {
      final loading = snapshot.connectionState != ConnectionState.done;
      if (loading && !hasCache) {
        return ListView(
          padding: const EdgeInsets.all(Space.page),
          children: [Skeleton(layout: widget.skeleton)],
        );
      }
      if (loading) {
        return Column(
          children: [
            LinearProgressIndicator(
              minHeight: 2,
              semanticsLabel: context.l10n.loading,
            ),
            Expanded(child: widget.builder(cached as T, reload)),
          ],
        );
      }
      if (snapshot.hasError) {
        if (isOffline(snapshot.error!) && hasCache) {
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: OfflineBanner(onRetry: reload),
              ),
              Expanded(child: widget.builder(cached as T, reload)),
            ],
          );
        }
        return ListView(
          padding: const EdgeInsets.all(Space.page),
          children: [
            failureView(
              context,
              snapshot.error!,
              retry: reload,
              unavailableAction: widget.unavailableAction,
            ),
          ],
        );
      }
      return widget.builder(snapshot.data as T, reload);
    },
  );
}

/// Short lists: controls stay available while results are loading or
/// unavailable, pull-to-refresh, cached rows stay readable offline.
class ListLoadView<T> extends StatefulWidget {
  const ListLoadView({
    super.key,
    required this.loadKey,
    required this.filterKey,
    required this.load,
    required this.header,
    required this.items,
    required this.storageKey,
    this.skeleton = SkeletonLayout.cards,
    this.padding = const EdgeInsets.all(Space.page),
  });
  final Object loadKey;
  final Object filterKey;
  final Future<T> Function() load;
  final List<Widget> Function(T? data, Reload reload, bool loading) header;
  final List<Widget> Function(T data, Reload reload) items;
  final String storageKey;
  final SkeletonLayout skeleton;
  final EdgeInsets padding;

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

  Future<void> reload() async {
    final next = load();
    setState(() {
      future = next;
    });
    try {
      await next;
    } catch (_) {
      // Rendered below.
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<T>(
    future: future,
    builder: (context, snapshot) {
      final loading = snapshot.connectionState != ConnectionState.done;
      final data = !loading && !snapshot.hasError ? snapshot.data : null;
      final offline =
          snapshot.hasError && isOffline(snapshot.error!) && previousData != null;
      return RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          key: PageStorageKey(widget.storageKey),
          controller: scroll,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: widget.padding,
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          children: [
            if (offline) OfflineBanner(onRetry: reload),
            ...widget.header(offline ? previousData : data, reload, loading),
            if (snapshot.hasError && !offline) ...[
              failureView(context, snapshot.error!, retry: reload),
              const SizedBox(height: Space.md),
            ],
            if (snapshot.hasError && !offline && previousData != null)
              Padding(
                padding: EdgeInsets.only(bottom: Space.md),
                child: Text(context.l10n.previousListHint),
              ),
            if (offline)
              ...widget.items(previousData as T, reload)
            else if ((loading || snapshot.hasError) && previousData != null)
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
                        minHeight: 2,
                        semanticsLabel: context.l10n.loading,
                      ),
                    ),
                ],
              )
            else if (loading)
              Skeleton(layout: widget.skeleton)
            else if (!snapshot.hasError)
              ...widget.items(snapshot.data as T, reload),
          ],
        ),
      );
    },
  );
}

/// Paged API lists with infinite scroll. Refresh reloads every loaded page so
/// the reader keeps their place; a filter change starts again at the top.
class InfiniteList<T> extends StatefulWidget {
  const InfiniteList({
    super.key,
    required this.filterKey,
    required this.refreshKey,
    required this.load,
    required this.header,
    required this.item,
    required this.empty,
    required this.storageKey,
    this.skeleton = SkeletonLayout.cards,
    this.gap = Space.md,
    this.bottomPadding = Space.page,
  });
  final Object filterKey, refreshKey;
  final Future<PageData<T>> Function(int page) load;
  final List<Widget> Function(PageData<T>? data, Reload reload, bool loading)
  header;
  final Widget Function(T item, Reload reload) item;
  final Widget Function(Reload reload) empty;
  final String storageKey;
  final SkeletonLayout skeleton;
  final double gap, bottomPadding;
  @override
  State<InfiniteList<T>> createState() => _InfiniteListState<T>();
}

class _InfiniteListState<T> extends State<InfiniteList<T>> {
  final scroll = ScrollController();
  List<T>? items;
  PageData<T>? last;
  Object? error, moreError;
  bool loading = true, loadingMore = false;
  int generation = 0;

  @override
  void initState() {
    super.initState();
    scroll.addListener(onScroll);
    unawaited(refresh(reset: true));
  }

  @override
  void didUpdateWidget(covariant InfiniteList<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.filterKey != widget.filterKey) {
      unawaited(refresh(reset: true));
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && scroll.hasClients) scroll.jumpTo(0);
      });
    } else if (oldWidget.refreshKey != widget.refreshKey) {
      unawaited(refresh());
    }
  }

  @override
  void dispose() {
    scroll.dispose();
    super.dispose();
  }

  Future<void> refresh({bool reset = false}) async {
    final run = ++generation;
    final pages = reset ? 1 : (last?.page ?? 1);
    setState(() {
      loading = true;
      error = moreError = null;
      if (reset) {
        items = null;
        last = null;
      }
    });
    try {
      final loaded = <T>[];
      PageData<T>? page;
      for (var p = 1; p <= pages; p++) {
        page = await widget.load(p);
        if (run != generation || !mounted) return;
        loaded.addAll(page.items);
        if (!page.hasNext) break;
      }
      setState(() {
        items = loaded;
        last = page;
        loading = false;
      });
    } catch (e) {
      if (run != generation || !mounted) return;
      setState(() {
        error = e;
        loading = false;
      });
    }
  }

  void onScroll() {
    if (!scroll.hasClients || loading || loadingMore) return;
    if (last?.hasNext != true || moreError != null) return;
    if (scroll.position.extentAfter < 480) unawaited(more());
  }

  Future<void> more() async {
    final current = last;
    if (current == null) return;
    final run = generation;
    setState(() {
      loadingMore = true;
      moreError = null;
    });
    try {
      final page = await widget.load(current.page + 1);
      if (run != generation || !mounted) return;
      setState(() {
        items = [...?items, ...page.items];
        last = page;
        loadingMore = false;
      });
    } catch (e) {
      if (run != generation || !mounted) return;
      setState(() {
        moreError = e;
        loadingMore = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = items;
    final offline = error != null && isOffline(error!) && rows != null;
    final summary = rows == null || last == null
        ? null
        : PageData<T>(rows, last!.total, last!.page, size: last!.size);
    // A failed refresh keeps the rows the reader was on, dimmed, so the
    // scroll position survives until a retry succeeds.
    final stale = error != null && !offline && rows != null;
    final list = RefreshIndicator(
      onRefresh: refresh,
      child: ListView(
        key: PageStorageKey(widget.storageKey),
        controller: scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(
          Space.page,
          Space.page,
          Space.page,
          widget.bottomPadding,
        ),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          if (offline) OfflineBanner(onRetry: refresh),
          ...widget.header(error == null || offline ? summary : null, refresh, loading),
          if (error != null && !offline) ...[
            failureView(context, error!, retry: refresh),
            const SizedBox(height: Space.md),
          ],
          if (stale)
            Padding(
              padding: const EdgeInsets.only(bottom: Space.md),
              child: Text(
                context.l10n.previousListHint,
                style: TextStyle(color: context.colors.secondary),
              ),
            ),
          if (rows == null && loading)
            Skeleton(layout: widget.skeleton)
          else if (rows != null) ...[
            if (rows.isEmpty && !loading && error == null) widget.empty(refresh),
            for (final row in rows)
              Padding(
                padding: EdgeInsets.only(bottom: widget.gap),
                child: stale || loading
                    ? IgnorePointer(
                        ignoring: stale,
                        child: Opacity(
                          opacity: stale ? .55 : 1,
                          child: widget.item(row, refresh),
                        ),
                      )
                    : widget.item(row, refresh),
              ),
            if (stale)
              const SizedBox.shrink()
            else if (loadingMore)
              const Skeleton(count: 1)
            else if (moreError != null)
              ErrorState(failureText(moreError!), retry: more)
            else if (last?.hasNext == true)
              Center(
                child: PillButton(
                  label: context.l10n.loadMore,
                  kind: PillKind.quiet,
                  icon: Icons.expand_more,
                  onPressed: more,
                ),
              ),
          ],
        ],
      ),
    );
    return Stack(
      children: [
        list,
        // Pinned to the viewport so a reader deep in the list still sees it.
        if (loading && rows != null)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: LinearProgressIndicator(
              minHeight: 2,
              semanticsLabel: context.l10n.loading,
            ),
          ),
      ],
    );
  }
}

class ListSearchField extends StatefulWidget {
  const ListSearchField({
    super.key,
    required this.controller,
    required this.label,
    required this.hint,
    required this.onSearch,
    this.maxLength,
  });
  final TextEditingController controller;
  final String label, hint;
  final ValueChanged<String> onSearch;
  final int? maxLength;
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
          maxLength: widget.maxLength,
          buildCounter: (
            context, {
            required currentLength,
            required isFocused,
            maxLength,
          }) => null,
          decoration: InputDecoration(
            hintText: widget.hint,
            labelText: widget.label,
            floatingLabelBehavior: FloatingLabelBehavior.never,
            fillColor: context.colors.elevated,
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
    this.kind = PillKind.primary,
    this.large = false,
    this.icon,
  });
  final String label;
  final VoidCallback? onPressed;
  final bool busy, large;
  final PillKind kind;
  final IconData? icon;
  @override
  Widget build(BuildContext context) => PillButton(
    label: label,
    onPressed: onPressed,
    busy: busy,
    kind: kind,
    large: large,
    icon: icon,
    expand: true,
  );
}

class Pair extends StatelessWidget {
  const Pair(
    this.label,
    this.value, {
    super.key,
    this.emphasis = false,
    this.mono = false,
  });
  final String label, value;
  final bool emphasis, mono;
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
            style: emphasis
                ? context.numeral(18)
                : mono
                ? context.mono()
                : null,
          ),
        ),
      ],
    ),
  );
}

/// "+998901234567" → "+998 90 123 45 67"; other numbers stay as entered.
String formatPhone(String value) {
  final digits = value.replaceAll(RegExp(r'\D'), '');
  final match = RegExp(
    r'^998(\d{2})(\d{3})(\d{2})(\d{2})$',
  ).firstMatch(digits);
  return match == null
      ? value
      : '+998 ${match[1]} ${match[2]} ${match[3]} ${match[4]}';
}

/// Multi-line fields use the 18px tile radius; pills are for single lines.
InputDecoration areaDecoration(
  BuildContext context, {
  required String label,
  String? hint,
}) {
  final p = context.colors;
  OutlineInputBorder border(Color color, [double width = 1]) =>
      OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.tile),
        borderSide: BorderSide(color: color, width: width),
      );
  return InputDecoration(
    labelText: label,
    hintText: hint,
    alignLabelWithHint: true,
    border: border(p.border),
    enabledBorder: border(p.border),
    focusedBorder: border(p.brand, 2),
    errorBorder: border(p.danger),
    focusedErrorBorder: border(p.danger, 2),
  );
}

/// Opens the dialler; falls back to copying the number.
Future<void> callNumber(BuildContext context, String phone) =>
    dial(context, phone);

/// Overridable for tests and platforms without a dialler.
Future<void> Function(BuildContext context, String phone) dial =
    _copyNumber;

Future<void> _copyNumber(BuildContext context, String phone) async {
  await copyText(context, phone, context.l10n.phoneCopied);
}

Future<void> copyText(BuildContext context, String text, String done) async {
  try {
    await Clipboard.setData(ClipboardData(text: text));
  } catch (_) {
    // Clipboard is best effort; the toast still shows the value.
  }
  if (context.mounted) toast(context, '$done · $text');
}
