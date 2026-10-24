import 'package:flutter/material.dart';

import '../../data/api_client.dart';
import '../../data/customer_portal.dart';
import '../../domain/models.dart';
import '../../domain/portal.dart';
import '../../design/theme.dart';
import '../../design/widgets.dart';
import '../../l10n/l10n.dart';
import 'messages.dart';

String estimateLabel(BuildContext context, EstimateStatus status) =>
    switch (status) {
      EstimateStatus.sent => context.l10n.needsApproval,
      EstimateStatus.approved => context.l10n.approved,
      EstimateStatus.rejected => context.l10n.declined,
    };

class EstimateChip extends StatelessWidget {
  const EstimateChip(this.status, {super.key});
  final EstimateStatus status;
  @override
  Widget build(BuildContext context) => StatusBadge(
    estimateLabel(context, status),
    tone: switch (status) {
      EstimateStatus.sent => 'warning',
      EstimateStatus.approved => 'success',
      EstimateStatus.rejected => 'danger',
    },
    icon: switch (status) {
      EstimateStatus.sent => Icons.pending_actions_outlined,
      EstimateStatus.approved => Icons.check_circle_outline,
      EstimateStatus.rejected => Icons.cancel_outlined,
    },
  );
}

String paymentMethodLabel(BuildContext context, String code) => switch (code) {
  'cash' => context.l10n.cash,
  'card' => context.l10n.card,
  'bank_transfer' => context.l10n.bankTransfer,
  'online' => context.l10n.online,
  _ => context.l10n.other,
};

IconData paymentMethodIcon(String code) => switch (code) {
  'cash' => Icons.payments_outlined,
  'card' => Icons.credit_card,
  'bank_transfer' => Icons.account_balance_outlined,
  'online' => Icons.phone_iphone,
  _ => Icons.more_horiz,
};

class BillingTab extends StatelessWidget {
  const BillingTab({super.key, required this.portal, this.refreshKey = 0});
  final CustomerPortal portal;
  final int refreshKey;
  @override
  Widget build(BuildContext context) => LoadView<BillingOverview>(
    loadKey: (portal, refreshKey),
    skeleton: SkeletonLayout.cards,
    load: portal.billing,
    builder: (billing, reload) {
      final p = context.colors;
      return RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Space.page),
          children: [
            Semantics(
              header: true,
              child: Text(
                context.l10n.billing,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
            ),
            const SizedBox(height: Space.grid),
            BentoCard(
              elevated: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    context.l10n.totalOwed,
                    style: TextStyle(color: p.secondary),
                  ),
                  const SizedBox(height: Space.xs),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      context.money(billing.owed),
                      style: context.numeral(
                        30,
                        color: billing.owed.cents > 0 ? p.text : p.success,
                      ),
                    ),
                  ),
                  const SizedBox(height: Space.sm),
                  billing.owed.cents > 0
                      ? StatusBadge(
                          context.l10n.invoicesOpen(
                            billing.invoices
                                .where((i) => i.balance.cents > 0)
                                .length,
                          ),
                          tone: billing.invoices.any(
                                (i) => i.status == 'overdue',
                              )
                              ? 'danger'
                              : 'warning',
                          icon: Icons.receipt_long_outlined,
                        )
                      : StatusBadge(
                          context.l10n.allPaid,
                          tone: 'success',
                          icon: Icons.check_circle_outline,
                        ),
                ],
              ),
            ),
            if (billing.estimates.isNotEmpty) ...[
              SectionTitle(context.l10n.estimatesToApprove),
              for (final estimate in billing.estimates)
                Padding(
                  padding: const EdgeInsets.only(bottom: Space.md),
                  child: _DocumentRow(
                    code: estimate.code,
                    subtitle: estimate.vehicle,
                    amount: context.money(estimate.total),
                    chip: EstimateChip(estimate.status),
                    icon: Icons.request_quote_outlined,
                    onTap: () async {
                      await openPage(
                        context,
                        EstimateScreen(portal: portal, id: estimate.id),
                      );
                      await reload();
                    },
                  ),
                ),
            ],
            SectionTitle(context.l10n.invoices),
            if (billing.invoices.isEmpty)
              EmptyState(
                icon: Icons.receipt_long_outlined,
                title: context.l10n.noInvoices,
              ),
            for (final invoice in billing.invoices)
              Padding(
                padding: const EdgeInsets.only(bottom: Space.md),
                child: _DocumentRow(
                  code: invoice.code,
                  subtitle: [
                    if (invoice.date != null) context.date(invoice.date!),
                    if (invoice.balance.cents > 0)
                      '${context.l10n.balance}: ${context.money(invoice.balance, invoice.currency)}',
                  ].join(' · '),
                  amount: context.money(invoice.total, invoice.currency),
                  chip: BillStatusChip(invoice.status),
                  icon: Icons.receipt_long_outlined,
                  onTap: () => openPage(
                    context,
                    PortalInvoiceScreen(portal: portal, id: invoice.id),
                  ),
                ),
              ),
            if (billing.receipts.isNotEmpty) ...[
              SectionTitle(context.l10n.receipts),
              BentoCard(
                padding: const EdgeInsets.symmetric(vertical: Space.sm),
                child: Column(
                  children: [
                    for (final (code, receipt) in billing.receipts)
                      ListTile(
                        minTileHeight: 64,
                        leading: IconSquare(
                          paymentMethodIcon(receipt.method),
                          tone: 'success',
                          size: 40,
                        ),
                        title: Text(
                          context.money(receipt.amount),
                          style: context.numeral(16),
                        ),
                        subtitle: Text(
                          '${paymentMethodLabel(context, receipt.method)} · ${receipt.date == null ? '' : context.date(receipt.date!)}',
                        ),
                        trailing: Text(code, style: context.mono(size: 12)),
                      ),
                  ],
                ),
              ),
            ],
          ],
        ),
      );
    },
  );
}

class _DocumentRow extends StatelessWidget {
  const _DocumentRow({
    required this.code,
    required this.subtitle,
    required this.amount,
    required this.chip,
    required this.icon,
    required this.onTap,
  });
  final String code, subtitle, amount;
  final Widget chip;
  final IconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => BentoCard(
    padding: const EdgeInsets.all(Space.tile),
    onTap: onTap,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            IconSquare(icon, size: 40),
            const SizedBox(width: Space.md),
            Expanded(
              child: Text(
                code,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.mono(size: 14),
              ),
            ),
            const Icon(Icons.chevron_right),
          ],
        ),
        if (subtitle.isNotEmpty) ...[
          const SizedBox(height: Space.sm),
          Text(subtitle, style: TextStyle(color: context.colors.secondary)),
        ],
        const SizedBox(height: Space.sm),
        Wrap(
          spacing: Space.sm,
          runSpacing: Space.sm,
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [chip, Text(amount, style: context.numeral(18))],
        ),
      ],
    ),
  );
}

/// Line items as tiles: description, qty × unit price, line total.
class LineTiles extends StatelessWidget {
  const LineTiles({super.key, required this.lines, this.currency = 'UZS'});
  final List<BillLine> lines;
  final String currency;
  @override
  Widget build(BuildContext context) => Column(
    children: [
      for (final line in lines)
        Padding(
          padding: const EdgeInsets.only(bottom: Space.sm),
          child: Container(
            padding: const EdgeInsets.all(Space.tile),
            decoration: BoxDecoration(
              color: context.colors.muted,
              borderRadius: BorderRadius.circular(Radii.tile),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                IconSquare(
                  line.kind == 'part'
                      ? Icons.settings_input_component_outlined
                      : line.kind == 'discount'
                      ? Icons.sell_outlined
                      : Icons.handyman_outlined,
                  size: 40,
                ),
                const SizedBox(width: Space.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        line.description,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: Space.xs),
                      Wrap(
                        spacing: Space.sm,
                        runSpacing: 2,
                        alignment: WrapAlignment.spaceBetween,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            '${line.quantity.toString().replaceFirst(RegExp(r'\.0$'), '')} × ${context.money(line.price, currency)}',
                            style: TextStyle(color: context.colors.secondary),
                          ),
                          Text(
                            '${line.kind == 'discount' ? '−' : ''}${context.money(line.total, currency)}',
                            style: context.numeral(16),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
    ],
  );
}

class EstimateScreen extends StatefulWidget {
  const EstimateScreen({super.key, required this.portal, required this.id});
  final CustomerPortal portal;
  final String id;
  @override
  State<EstimateScreen> createState() => _EstimateScreenState();
}

class _EstimateScreenState extends State<EstimateScreen> {
  Estimate? estimate;
  Object? error;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() => error = null);
    try {
      final value = await widget.portal.estimate(widget.id);
      if (mounted) setState(() => estimate = value);
    } catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  Future<void> decide(bool approve) async {
    if (!approve) {
      final yes = await confirmSheet(
        context,
        title: context.l10n.declineEstimateTitle,
        message: context.l10n.declineEstimateHint,
        confirmLabel: context.l10n.decline,
      );
      if (!yes || !mounted) return;
    }
    setState(() => busy = true);
    try {
      final value = await widget.portal.decideEstimate(
        widget.id,
        approve: approve,
      );
      if (!mounted) return;
      setState(() => estimate = value);
      toast(
        context,
        approve ? context.l10n.estimateApproved : context.l10n.estimateDeclined,
      );
    } catch (e) {
      if (mounted) toast(context, context.message(failureText(e)));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> ask() async {
    final question = await textSheet(
      context,
      title: context.l10n.askQuestion,
      label: context.l10n.yourQuestion,
      confirmLabel: context.l10n.send,
    );
    if (question == null || question.isEmpty || !mounted) return;
    setState(() => busy = true);
    try {
      final thread = await widget.portal.askAboutEstimate(widget.id, question);
      if (!mounted) return;
      await openPage(
        context,
        CustomerChatScreen(
          portal: widget.portal,
          thread: thread,
          title: widget.portal.garageName,
        ),
      );
    } catch (e) {
      if (mounted) toast(context, context.message(failureText(e)));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final value = estimate;
    final p = context.colors;
    return PageFrame(
      title: context.l10n.estimate,
      demo: widget.portal.isDemo,
      footerPadding: false,
      body: error != null
          ? ListView(
              padding: const EdgeInsets.all(Space.page),
              children: [failureView(context, error!, retry: load)],
            )
          : value == null
          ? const SkeletonPage(layout: SkeletonLayout.detail)
          : ListView(
              padding: const EdgeInsets.all(Space.page),
              children: [
                BentoCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: Space.sm,
                        runSpacing: Space.sm,
                        children: [
                          MonoBadge(
                            value.code,
                            icon: Icons.request_quote_outlined,
                          ),
                          EstimateChip(value.status),
                        ],
                      ),
                      const SizedBox(height: Space.md),
                      Text(
                        value.vehicle,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      if (value.plate != null) ...[
                        const SizedBox(height: Space.xs),
                        Plate(value.plate),
                      ],
                      const SizedBox(height: Space.sm),
                      Text(
                        context.date(value.date),
                        style: TextStyle(color: p.secondary),
                      ),
                    ],
                  ),
                ),
                SectionTitle(context.l10n.servicesAndParts),
                LineTiles(lines: value.lines),
                BentoCard(
                  padding: const EdgeInsets.symmetric(
                    horizontal: Space.card,
                    vertical: Space.md,
                  ),
                  child: Column(
                    children: [
                      Pair(context.l10n.subtotal, context.money(value.subtotal)),
                      Pair(
                        '${context.l10n.vat} ${value.taxRate.toStringAsFixed(0)}%',
                        context.money(value.tax),
                      ),
                      Pair(
                        context.l10n.total,
                        context.money(value.total),
                        emphasis: true,
                      ),
                    ],
                  ),
                ),
                if (value.notes != null) ...[
                  SectionTitle(context.l10n.garageNotes),
                  BentoCard(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.format_quote, color: p.secondary),
                        const SizedBox(width: Space.sm),
                        Expanded(
                          child: Text(
                            value.notes!,
                            style: Theme.of(context).textTheme.bodyLarge,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: Space.group),
              ],
            ),
      footer: value == null
          ? null
          : value.status != EstimateStatus.sent
          ? SafeArea(
              minimum: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: PillButton(
                label: context.l10n.askQuestion,
                icon: Icons.chat_bubble_outline,
                kind: PillKind.secondary,
                expand: true,
                onPressed: busy ? null : ask,
              ),
            )
          : StickyActionBar(
              label: context.l10n.total,
              value: context.money(value.total),
              above: Row(
                children: [
                  Expanded(
                    child: PillButton(
                      label: context.l10n.decline,
                      kind: PillKind.secondary,
                      onPressed: busy ? null : () => decide(false),
                    ),
                  ),
                  const SizedBox(width: Space.sm),
                  Expanded(
                    child: PillButton(
                      label: context.l10n.askQuestion,
                      icon: Icons.chat_bubble_outline,
                      kind: PillKind.secondary,
                      onPressed: busy ? null : ask,
                    ),
                  ),
                ],
              ),
              action: PillButton(
                label: context.l10n.approve,
                icon: Icons.check,
                kind: PillKind.emerald,
                busy: busy,
                onPressed: () => decide(true),
              ),
            ),
    );
  }
}

class PortalInvoiceScreen extends StatelessWidget {
  const PortalInvoiceScreen({super.key, required this.portal, required this.id});
  final CustomerPortal portal;
  final String id;
  @override
  Widget build(BuildContext context) => PageFrame(
    title: context.l10n.invoice,
    demo: portal.isDemo,
    body: LoadView<PortalInvoice>(
      loadKey: (portal, id),
      load: () => portal.invoice(id),
      builder: (invoice, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Space.page),
          children: [
            PaymentVault(
              code: invoice.code,
              status: BillStatusChip(invoice.status),
              balanceLabel: context.l10n.remainingAmount,
              balance: context.money(invoice.balance, invoice.currency),
              paidLabel: context.l10n.paid,
              paid: context.money(invoice.paid, invoice.currency),
              totalLabel: context.l10n.total,
              total: context.money(invoice.total, invoice.currency),
              progress: invoice.total.cents == 0
                  ? 0
                  : invoice.paid.cents / invoice.total.cents,
              action: invoice.link == null
                  ? null
                  : PillButton(
                      label: context.l10n.sharePdfLink,
                      icon: Icons.picture_as_pdf_outlined,
                      kind: PillKind.emerald,
                      expand: true,
                      onPressed: () => copyText(
                        context,
                        invoice.link!,
                        context.l10n.linkCopied,
                      ),
                    ),
            ),
            if (invoice.date != null || invoice.dueDate != null) ...[
              const SizedBox(height: Space.grid),
              BentoGrid(
                square: false,
                children: [
                  if (invoice.date != null)
                    BentoTile(
                      icon: Icons.event_outlined,
                      label: context.l10n.issued,
                      valueWidget: Text(
                        context.date(invoice.date!),
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                  if (invoice.dueDate != null)
                    BentoTile(
                      icon: Icons.event_busy_outlined,
                      tone: invoice.status == 'overdue' ? 'danger' : null,
                      label: context.l10n.dueDate,
                      valueWidget: Text(
                        context.date(invoice.dueDate!),
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                ],
              ),
            ],
            SectionTitle(context.l10n.invoiceLines),
            if (invoice.lines.isEmpty)
              Text(context.l10n.emptyHistory)
            else
              LineTiles(lines: invoice.lines, currency: invoice.currency),
            SectionTitle(context.l10n.paymentHistory),
            if (invoice.payments.isEmpty)
              EmptyState(
                icon: Icons.payments_outlined,
                title: context.l10n.noPayments,
              )
            else
              BentoCard(
                padding: const EdgeInsets.symmetric(vertical: Space.sm),
                child: Column(
                  children: [
                    for (final payment in invoice.payments)
                      ListTile(
                        minTileHeight: 64,
                        leading: IconSquare(
                          paymentMethodIcon(payment.method),
                          tone: 'success',
                          size: 40,
                        ),
                        title: Text(
                          '${payment.kind == 'deposit'
                              ? context.l10n.customerDeposit
                              : payment.kind == 'refund'
                              ? context.l10n.customerRefund
                              : context.l10n.customerPayment} · ${paymentMethodLabel(context, payment.method)}',
                        ),
                        subtitle: payment.date == null
                            ? null
                            : Text(
                                '${context.date(payment.date!.toLocal())} · ${context.clock(payment.date!.toLocal())}',
                              ),
                        trailing: Text(
                          context.money(payment.amount, invoice.currency),
                          style: context.numeral(16),
                        ),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    ),
  );
}
