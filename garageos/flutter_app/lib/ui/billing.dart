import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../data/api_client.dart';
import '../data/payment_store.dart';
import '../data/repository.dart';
import '../design/theme.dart';
import '../design/widgets.dart';
import '../domain/models.dart';
import '../l10n/l10n.dart';
import 'customer/billing.dart' show LineTiles, paymentMethodIcon, paymentMethodLabel;
import 'customers.dart' show requiredText;

class BillList extends StatefulWidget {
  const BillList({super.key, required this.repository, this.refreshKey = 0});
  final GarageRepository repository;
  final int refreshKey;
  @override
  State<BillList> createState() => _BillListState();
}

class _BillListState extends State<BillList> {
  String query = '';
  BillView view = BillView.unpaid;
  final search = TextEditingController();
  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  void updateSearch(String value) {
    if (query == value) return;
    setState(() => query = value);
  }

  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: BoxConstraints(maxWidth: Space.contentWidth),
      child: InfiniteList<Bill>(
        storageKey: 'staff-bill-list',
        filterKey: (query, view),
        refreshKey: (widget.repository, widget.refreshKey),
        load: (page) =>
            widget.repository.bills(query: query, page: page, view: view),
        header: (bills, reload, loading) => [
          Row(
            children: [
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    context.l10n.invoices,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                ),
              ),
              IconButton(
                tooltip: context.l10n.refresh,
                onPressed: loading ? null : reload,
                icon: Icon(Icons.refresh),
              ),
            ],
          ),
          const SizedBox(height: Space.grid),
          PillSegments<BillView>(
            semanticLabel: context.l10n.invoices,
            values: const [BillView.drafts, BillView.unpaid, BillView.paid],
            selected: view,
            label: (value) => switch (value) {
              BillView.drafts => context.l10n.drafts,
              BillView.unpaid => context.l10n.unpaid,
              BillView.paid => context.l10n.paid,
              BillView.all => context.l10n.all,
            },
            onChanged: (value) => setState(() => view = value),
          ),
          const SizedBox(height: Space.md),
          ListSearchField(
            controller: search,
            label: context.l10n.searchInvoices,
            hint: context.l10n.invoiceSearchHint,
            onSearch: updateSearch,
            maxLength: 100,
          ),
          const SizedBox(height: Space.md),
          Text(
            loading && bills == null
                ? context.l10n.invoicesLoading
                : bills == null
                ? context.l10n.invoicesFailed
                : context.l10n.invoiceCount(bills.total),
            style: TextStyle(color: context.colors.secondary),
          ),
          const SizedBox(height: Space.md),
        ],
        empty: (reload) => EmptyNotice(
          query.isEmpty
              ? context.l10n.noInvoices
              : context.l10n.noMatchingInvoices,
          query.isEmpty
              ? context.l10n.createInvoiceHint
              : context.l10n.searchInvoicesHint,
          icon: Icons.receipt_long_outlined,
          action: query.isEmpty
              ? null
              : PillButton(
                  label: context.l10n.clearSearch,
                  icon: Icons.search_off,
                  kind: PillKind.secondary,
                  onPressed: () {
                    search.clear();
                    updateSearch('');
                  },
                ),
        ),
        item: (bill, reload) => BillTile(
          bill: bill,
          onTap: () async {
            await openPage(
              context,
              BillScreen(repository: widget.repository, bill: bill),
            );
            await reload();
          },
        ),
      ),
    ),
  );
}

/// Invoice card: mono code, customer, total, balance and due date.
class BillTile extends StatelessWidget {
  const BillTile({super.key, required this.bill, required this.onTap});
  final Bill bill;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    return BentoCard(
      padding: const EdgeInsets.all(Space.tile),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: Space.sm,
            runSpacing: Space.sm,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(bill.code, style: context.mono(size: 15)),
              BillStatusChip(bill.status),
            ],
          ),
          const SizedBox(height: Space.md),
          Text(bill.customerName, style: Theme.of(context).textTheme.titleMedium),
          if (bill.vehicleLabel.isNotEmpty)
            Text(bill.vehicleLabel, style: TextStyle(color: p.secondary)),
          const SizedBox(height: Space.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.l10n.total,
                      style: Theme.of(
                        context,
                      ).textTheme.bodySmall?.copyWith(color: p.secondary),
                    ),
                    Text(
                      context.money(bill.total, bill.currency),
                      style: context.numeral(18),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    context.l10n.balance,
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: p.secondary),
                  ),
                  Text(
                    context.money(bill.balance, bill.currency),
                    style: context.numeral(
                      18,
                      color: bill.balance.cents > 0 ? p.warning : p.success,
                    ),
                  ),
                ],
              ),
            ],
          ),
          if (bill.dueDate != null) ...[
            const SizedBox(height: Space.sm),
            InfoLine(
              icon: Icons.event_outlined,
              text: '${context.l10n.dueDate}: ${context.date(bill.dueDate!)}',
            ),
          ],
        ],
      ),
    );
  }
}

class BillScreen extends StatefulWidget {
  const BillScreen({super.key, required this.repository, required this.bill});
  final GarageRepository repository;
  final Bill bill;
  @override
  State<BillScreen> createState() => _BillScreenState();
}

class _BillScreenState extends State<BillScreen> {
  late Bill bill = widget.bill;
  bool busy = true;
  String? error;
  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final current = await widget.repository.bill(bill.id);
      if (mounted) setState(() => bill = current);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> send() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final sent = await widget.repository.sendBill(bill.id);
      if (!mounted) return;
      setState(() => bill = sent);
      toast(context, context.l10n.invoiceSent);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canRecord = widget.repository.canWrite && error == null;
    return PageFrame(
      title: context.l10n.invoice,
      demo: widget.repository.isDemo,
      readOnly: !widget.repository.canWrite,
      actions: [
        IconButton(
          tooltip: context.l10n.refresh,
          onPressed: busy ? null : reload,
          icon: Icon(Icons.refresh),
        ),
        IconButton(
          tooltip: context.l10n.showCustomer,
          onPressed: busy || error != null
              ? null
              : () => openPage(
                  context,
                  CustomerBillView(bill: bill, demo: widget.repository.isDemo),
                ),
          icon: Icon(Icons.visibility_outlined),
        ),
      ],
      body: RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.all(Space.page),
          children: [
            if (busy) LinearProgressIndicator(minHeight: 2),
            if (busy) SizedBox(height: Space.md),
            if (error != null) ErrorNotice(error!, retry: reload),
            PaymentVault(
              code: bill.code,
              status: BillStatusChip(bill.status),
              balanceLabel: context.l10n.remainingAmount,
              balance: context.money(bill.balance, bill.currency),
              paidLabel: context.l10n.paid,
              paid: context.money(bill.paid, bill.currency),
              totalLabel: context.l10n.total,
              total: context.money(bill.total, bill.currency),
              progress: bill.total.cents == 0
                  ? 0
                  : bill.paid.cents / bill.total.cents,
              action: !canRecord
                  ? null
                  : bill.status == 'draft'
                  ? PillButton(
                      label: context.l10n.sendToCustomer,
                      icon: Icons.send_outlined,
                      kind: PillKind.emerald,
                      expand: true,
                      busy: busy,
                      onPressed: send,
                    )
                  : PillButton(
                      label: context.l10n.recordOrCheckPayment,
                      icon: Icons.payments_outlined,
                      kind: PillKind.emerald,
                      expand: true,
                      busy: busy,
                      onPressed: () async {
                        await openPage(
                          context,
                          PaymentForm(repository: widget.repository, bill: bill),
                        );
                        if (mounted) await reload();
                      },
                    ),
            ),
            SizedBox(height: Space.grid),
            BillContent(bill: bill),
            SectionTitle(context.l10n.paymentHistory),
            if (bill.receipts.isEmpty)
              EmptyState(
                icon: Icons.payments_outlined,
                title: context.l10n.noPayments,
              ),
            if (bill.receipts.isNotEmpty)
              BentoCard(
                padding: const EdgeInsets.symmetric(vertical: Space.sm),
                child: Column(
                  children: [
                    for (final receipt in bill.receipts)
                      ListTile(
                        minTileHeight: 64,
                        leading: IconSquare(
                          paymentMethodIcon(receipt.method),
                          tone: receipt.kind == 'refund' ? 'danger' : 'success',
                          size: 40,
                        ),
                        title: Text(
                          receipt.kind == 'refund'
                              ? context.l10n.refund
                              : context.message(paymentLabel(receipt.method)),
                        ),
                        subtitle: receipt.date == null
                            ? null
                            : Text(
                                '${context.date(receipt.date!.toLocal())} · ${context.clock(receipt.date!.toLocal())}',
                              ),
                        trailing: Text(
                          context.money(receipt.amount, bill.currency),
                          style: context.numeral(16),
                        ),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class BillContent extends StatelessWidget {
  const BillContent({super.key, required this.bill});
  final Bill bill;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      BentoCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              context.l10n.invoice,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: context.colors.secondary,
              ),
            ),
            SelectableText(bill.code, style: context.mono(size: 16)),
            Divider(),
            Text(
              bill.customerName,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (bill.vehicleLabel.isNotEmpty) Text(bill.vehicleLabel),
            if (bill.dueDate != null)
              Pair(context.l10n.dueDate, context.date(bill.dueDate!)),
          ],
        ),
      ),
      SectionTitle(context.l10n.servicesAndParts),
      LineTiles(lines: bill.lines, currency: bill.currency),
      BentoCard(
        padding: const EdgeInsets.symmetric(
          horizontal: Space.card,
          vertical: Space.md,
        ),
        child: Column(
          children: [
            Pair(
              context.l10n.subtotal,
              context.money(bill.subtotal, bill.currency),
            ),
            if (bill.discount.cents != 0)
              Pair(
                context.l10n.discount,
                '−${context.money(bill.discount, bill.currency)}',
              ),
            Pair(context.l10n.vat, context.money(bill.tax, bill.currency)),
            Pair(
              context.l10n.total,
              context.money(bill.total, bill.currency),
              emphasis: true,
            ),
            Pair(context.l10n.paid, context.money(bill.paid, bill.currency)),
            Pair(
              context.l10n.balance,
              context.money(bill.balance, bill.currency),
              emphasis: true,
            ),
          ],
        ),
      ),
    ],
  );
}

class CustomerBillView extends StatelessWidget {
  const CustomerBillView({super.key, required this.bill, required this.demo});
  final Bill bill;
  final bool demo;
  @override
  Widget build(BuildContext context) => PageFrame(
    title: context.l10n.customerInvoice,
    demo: demo,
    body: ListView(
      padding: EdgeInsets.all(Space.page),
      children: [BillContent(bill: bill)],
    ),
  );
}

class LineFields {
  LineFields({String text = '', this.localizedDefault = false})
    : description = TextEditingController(text: text);
  final TextEditingController description;
  final quantity = TextEditingController(text: '1'),
      price = TextEditingController();
  String kind = 'labor';
  bool localizedDefault;
  static double? parseQuantity(String text) {
    if (!RegExp(r'^\d{1,8}([.,]\d{1,2})?$').hasMatch(text)) return null;
    final value = double.tryParse(text.replaceAll(',', '.'));
    return value != null && value > 0 && value <= 99999999.99 ? value : null;
  }

  BillLine? get value {
    final q = parseQuantity(quantity.text);
    final p = Money.parse(price.text);
    return q != null && p != null && q * p.cents <= Money.maxCents
        ? BillLine(description.text.trim(), q, p, kind: kind)
        : null;
  }

  void dispose() {
    description.dispose();
    quantity.dispose();
    price.dispose();
  }
}

/// Invoice editor: line-item builder, tax rate and a live UZS total.
class BillForm extends StatefulWidget {
  const BillForm({super.key, required this.repository, required this.work});
  final GarageRepository repository;
  final Work work;
  @override
  State<BillForm> createState() => _BillFormState();
}

class _BillFormState extends State<BillForm> {
  final form = GlobalKey<FormState>(), lines = <LineFields>[];
  double taxRate = 0;
  bool busy = false, dirty = false, updatingDefaults = false;
  String? error;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (lines.isEmpty) {
      lines.add(
        LineFields(text: context.l10n.serviceWork, localizedDefault: true),
      );
    }
    updatingDefaults = true;
    for (final line in lines) {
      if (line.localizedDefault &&
          line.description.text != context.l10n.serviceWork) {
        line.description.text = context.l10n.serviceWork;
      }
    }
    updatingDefaults = false;
  }

  @override
  void dispose() {
    for (final line in lines) {
      line.dispose();
    }
    super.dispose();
  }

  ({int subtotal, int discount, int tax, int total}) get totals =>
      invoiceTotals(lines.map((l) => l.value), taxRate);

  Future<void> save({required bool send}) async {
    if (!validateForm(form)) return;
    final total = totals.total;
    if (total <= 0 || total > Money.maxCents) {
      setState(() => error = context.l10n.invoiceTotalError);
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final bill = await widget.repository.createBill(
        widget.work,
        lines.map((l) => l.value!).toList(),
        taxRate,
        send: send,
      );
      if (!mounted) return;
      toast(context, send ? context.l10n.invoiceSent : context.l10n.saved);
      Navigator.pop(context, bill);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.colors;
    final sums = totals;
    return PageFrame(
      title: context.l10n.invoiceEditor,
      demo: widget.repository.isDemo,
      hasChanges: dirty,
      isSaving: busy,
      footerPadding: false,
      body: Form(
        key: form,
        autovalidateMode: dirty
            ? AutovalidateMode.onUserInteraction
            : AutovalidateMode.disabled,
        onChanged: () {
          if (!updatingDefaults) setState(() => dirty = true);
        },
        child: ListView(
          padding: EdgeInsets.all(Space.page),
          children: [
            BentoCard(
              padding: const EdgeInsets.all(Space.tile),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.work.customerName,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        Text(
                          widget.work.car,
                          style: TextStyle(color: p.secondary),
                        ),
                      ],
                    ),
                  ),
                  Plate(widget.work.plate),
                ],
              ),
            ),
            SizedBox(height: Space.grid),
            if (error != null) ErrorNotice(error!),
            for (final line in lines)
              Padding(
                key: ObjectKey(line),
                padding: EdgeInsets.only(bottom: Space.md),
                child: BentoCard(
                  padding: const EdgeInsets.all(Space.tile),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              context.l10n.invoiceLine(lines.indexOf(line) + 1),
                              style: context.mono(size: 12, color: p.secondary),
                            ),
                          ),
                          IconButton(
                            tooltip: context.l10n.removeLine,
                            onPressed: busy || lines.length == 1
                                ? null
                                : () {
                                    setState(() {
                                      lines.remove(line);
                                      dirty = true;
                                    });
                                    line.dispose();
                                  },
                            icon: Icon(Icons.close),
                          ),
                        ],
                      ),
                      Wrap(
                        spacing: Space.xs,
                        runSpacing: Space.xs,
                        children: [
                          for (final (kind, label, icon) in [
                            ('labor', context.l10n.labor, Icons.handyman_outlined),
                            ('part', context.l10n.part, Icons.settings_input_component_outlined),
                            ('fee', context.l10n.fee, Icons.add_card_outlined),
                            ('discount', context.l10n.discount, Icons.sell_outlined),
                          ])
                            ChoiceChip(
                              avatar: Icon(icon, size: 16),
                              label: Text(label),
                              selected: line.kind == kind,
                              showCheckmark: false,
                              onSelected: busy
                                  ? null
                                  : (_) => setState(() {
                                      line.kind = kind;
                                      dirty = true;
                                    }),
                            ),
                        ],
                      ),
                      SizedBox(height: Space.md),
                      TextFormField(
                        controller: line.description,
                        enabled: !busy,
                        onChanged: (_) => line.localizedDefault = false,
                        maxLength: 255,
                        validator: (value) =>
                            context.validation(requiredText(value)),
                        decoration: InputDecoration(
                          labelText: context.l10n.lineDescription,
                        ),
                      ),
                      SizedBox(height: Space.sm),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SizedBox(
                            width: 110,
                            child: TextFormField(
                              controller: line.quantity,
                              enabled: !busy,
                              style: context.mono(size: 16),
                              keyboardType: TextInputType.numberWithOptions(
                                decimal: true,
                              ),
                              decoration: InputDecoration(
                                labelText: context.l10n.quantity,
                              ),
                              onChanged: (_) => setState(() {}),
                              validator: (v) =>
                                  LineFields.parseQuantity(v ?? '') != null
                                  ? null
                                  : context.l10n.quantityError,
                            ),
                          ),
                          SizedBox(width: Space.sm),
                          Expanded(
                            child: TextFormField(
                              controller: line.price,
                              enabled: !busy,
                              style: context.mono(size: 16),
                              keyboardType: TextInputType.number,
                              decoration: InputDecoration(
                                labelText: context.l10n.unitPrice,
                                suffixText: context.l10n.uzs,
                              ),
                              onChanged: (_) => setState(() {}),
                              validator: (v) {
                                final price = Money.parse(v ?? '');
                                if (price == null) return context.l10n.priceError;
                                final quantity = LineFields.parseQuantity(
                                  line.quantity.text,
                                );
                                if (quantity != null &&
                                    quantity * price.cents > Money.maxCents) {
                                  return context.l10n.lineTotalError;
                                }
                                return null;
                              },
                            ),
                          ),
                        ],
                      ),
                      Pair(
                        context.l10n.lineTotal,
                        line.value == null
                            ? '—'
                            : '${line.kind == 'discount' ? '−' : ''}${context.money(line.value!.total)}',
                      ),
                    ],
                  ),
                ),
              ),
            PillButton(
              label: context.l10n.addLine,
              icon: Icons.add,
              kind: PillKind.secondary,
              onPressed: busy
                  ? null
                  : () => setState(() {
                      lines.add(LineFields(text: ''));
                      dirty = true;
                    }),
            ),
            SizedBox(height: Space.grid),
            DropdownButtonFormField<double>(
              initialValue: taxRate,
              borderRadius: BorderRadius.circular(Radii.tile),
              decoration: InputDecoration(
                labelText: context.l10n.vat,
                prefixIcon: const Icon(Icons.percent),
              ),
              items: [
                DropdownMenuItem(value: 0, child: Text('0%')),
                DropdownMenuItem(value: 12, child: Text('12%')),
              ],
              onChanged: busy ? null : (v) => setState(() => taxRate = v!),
            ),
            SizedBox(height: Space.md),
            BentoCard(
              padding: const EdgeInsets.symmetric(
                horizontal: Space.card,
                vertical: Space.md,
              ),
              child: Column(
                children: [
                  Pair(context.l10n.subtotal, context.money(Money(sums.subtotal))),
                  if (sums.discount > 0)
                    Pair(
                      context.l10n.discount,
                      '−${context.money(Money(sums.discount))}',
                    ),
                  Pair(context.l10n.vat, context.money(Money(sums.tax))),
                ],
              ),
            ),
            SizedBox(height: Space.group),
          ],
        ),
      ),
      footer: StickyActionBar(
        label: context.l10n.total,
        value: context.money(Money(sums.total)),
        above: PillButton(
          label: context.l10n.saveDraft,
          icon: Icons.save_outlined,
          kind: PillKind.secondary,
          expand: true,
          onPressed: busy ? null : () => save(send: false),
        ),
        action: PillButton(
          label: context.l10n.sendToCustomer,
          icon: Icons.send_outlined,
          kind: PillKind.emerald,
          busy: busy,
          onPressed: () => save(send: true),
        ),
      ),
    );
  }
}

/// Record payment: dark balance summary, prefilled amount, method tiles and
/// a Paid / Partly paid receipt state.
class PaymentForm extends StatefulWidget {
  const PaymentForm({super.key, required this.repository, required this.bill});
  final GarageRepository repository;
  final Bill bill;
  @override
  State<PaymentForm> createState() => _PaymentFormState();
}

class _PaymentFormState extends State<PaymentForm> {
  final form = GlobalKey<FormState>(), amount = TextEditingController();
  late Bill bill = widget.bill;
  String method = 'cash';
  PendingPayment? pending;
  Bill? receipt;
  Money? recorded;
  bool busy = true, ready = false, dirty = false;
  String? error;
  @override
  void initState() {
    super.initState();
    reload();
  }

  @override
  void dispose() {
    amount.dispose();
    super.dispose();
  }

  Future<void> reload() async {
    setState(() {
      busy = true;
      ready = false;
      error = null;
    });
    try {
      final previous = await widget.repository.payments.read(bill.id);
      final current = await widget.repository.bill(bill.id);
      if (mounted) {
        setState(() {
          bill = current;
          pending = previous;
          ready = true;
          method = previous?.method ?? method;
          amount.text = (previous?.amount ?? current.balance).input(
            current.currency,
          );
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> pay() async {
    if (!ready || (pending == null && !validateForm(form))) return;
    final intent =
        pending ??
        PendingPayment(Money.parse(amount.text)!, method, Uuid().v4());
    setState(() {
      pending = intent;
      busy = true;
      error = null;
    });
    try {
      final result = await widget.repository.pay(
        bill.id,
        intent.amount,
        intent.method,
        intent.key,
      );
      if (mounted) {
        toast(context, context.l10n.paymentRecorded);
        setState(() {
          receipt = result;
          recorded = intent.amount;
          pending = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = failureText(e);
          if (e is AppFailure && !e.uncertain) pending = null;
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget receiptView(BuildContext context, Bill done) {
    final paid = done.status == 'paid';
    final p = context.colors;
    return ListView(
      padding: const EdgeInsets.all(Space.page),
      children: [
        BentoCard(
          color: paid ? p.successSoft : p.warningSoft,
          borderColor: Colors.transparent,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              IconSquare(
                paid ? Icons.check_circle_outline : Icons.timelapse,
                tone: paid ? 'success' : 'warning',
                size: 64,
              ),
              const SizedBox(height: Space.grid),
              Semantics(
                liveRegion: true,
                child: Text(
                  context.message(billStatusLabel(done.status)),
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: paid ? p.success : p.warning,
                  ),
                ),
              ),
              const SizedBox(height: Space.sm),
              Text(done.code, style: context.mono()),
              const SizedBox(height: Space.grid),
              Text(
                context.l10n.receivedAmount,
                style: TextStyle(color: p.secondary),
              ),
              Text(
                context.money(recorded!, done.currency),
                style: context.numeral(30),
              ),
              const SizedBox(height: Space.md),
              Pair(
                context.l10n.paymentMethod,
                context.message(paymentLabel(method)),
              ),
              Pair(
                context.l10n.remainingAmount,
                context.money(done.balance, done.currency),
                emphasis: true,
              ),
            ],
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final done = receipt;
    final entered = Money.parse(amount.text);
    return PageFrame(
      title: context.l10n.recordPayment,
      demo: widget.repository.isDemo,
      hasChanges: done == null && dirty && pending == null,
      isSaving: busy,
      footerPadding: done != null,
      body: done != null
          ? receiptView(context, done)
          : Form(
              key: form,
              autovalidateMode: AutovalidateMode.onUserInteraction,
              onChanged: () {
                if (ready && !busy) setState(() => dirty = true);
              },
              child: ListView(
                padding: EdgeInsets.all(Space.page),
                children: [
                  if (busy && !ready) LinearProgressIndicator(minHeight: 2),
                  if (busy && !ready) SizedBox(height: Space.md),
                  if (error != null)
                    ErrorNotice(error!, retry: !ready ? reload : null),
                  PaymentVault(
                    code: bill.code,
                    status: BillStatusChip(bill.status),
                    balanceLabel: context.l10n.remainingAmount,
                    balance: context.money(bill.balance, bill.currency),
                    paidLabel: context.l10n.paid,
                    paid: context.money(bill.paid, bill.currency),
                    totalLabel: context.l10n.total,
                    total: context.money(bill.total, bill.currency),
                    progress: bill.total.cents == 0
                        ? 0
                        : bill.paid.cents / bill.total.cents,
                  ),
                  SizedBox(height: Space.grid),
                  if (pending != null) ...[
                    Panel(child: Text(context.l10n.pendingPaymentHint)),
                    SizedBox(height: Space.md),
                  ],
                  TextFormField(
                    controller: amount,
                    enabled: !busy && pending == null && bill.canPay,
                    keyboardType: TextInputType.numberWithOptions(decimal: true),
                    style: context.numeral(22),
                    decoration: InputDecoration(
                      labelText: context.l10n.receivedAmount,
                      suffixText: bill.currency == 'UZS'
                          ? context.l10n.uzs
                          : bill.currency,
                    ),
                    onChanged: (_) => setState(() {}),
                    validator: (v) {
                      final money = Money.parse(v ?? '');
                      return money != null &&
                              money.cents > 0 &&
                              money.cents <= bill.balance.cents
                          ? null
                          : context.l10n.paymentAmountError;
                    },
                  ),
                  SectionTitle(context.l10n.paymentMethod),
                  BentoGrid(
                    square: false,
                    children: [
                      for (final code in ['cash', 'card', 'bank_transfer', 'online'])
                        Semantics(
                          selected: method == code,
                          button: true,
                          child: BentoTile(
                            icon: paymentMethodIcon(code),
                            tone: method == code ? 'strong' : null,
                            color: method == code
                                ? context.colors.successSoft
                                : null,
                            label: method == code
                                ? context.l10n.selected
                                : context.l10n.paymentMethod,
                            valueWidget: Text(
                              paymentMethodLabel(context, code),
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            onTap: busy || pending != null || !bill.canPay
                                ? null
                                : () => setState(() => method = code),
                          ),
                        ),
                    ],
                  ),
                  SizedBox(height: Space.md),
                  Text(
                    context.l10n.manualPaymentHint,
                    style: TextStyle(color: context.colors.secondary),
                  ),
                  if (!bill.canPay && pending == null) ...[
                    SizedBox(height: Space.md),
                    StatusBadge(
                      context.l10n.cannotPayInvoice,
                      tone: 'success',
                      icon: Icons.check_circle_outline,
                    ),
                  ],
                ],
              ),
            ),
      footer: done != null
          ? SaveButton(
              label: context.l10n.done,
              icon: Icons.check,
              onPressed: () => Navigator.pop(context, done),
            )
          : StickyActionBar(
              label: context.l10n.receivedAmount,
              value: entered == null
                  ? '—'
                  : context.money(pending?.amount ?? entered, bill.currency),
              action: PillButton(
                label: pending == null
                    ? context.l10n.recordPayment
                    : context.l10n.checkResult,
                icon: Icons.check,
                kind: PillKind.emerald,
                busy: busy,
                onPressed: ready && (bill.canPay || pending != null) ? pay : null,
              ),
            ),
    );
  }
}
