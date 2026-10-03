import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../data/api_client.dart';
import '../data/payment_store.dart';
import '../data/repository.dart';
import '../design/theme.dart';
import '../l10n/l10n.dart';
import '../design/widgets.dart';
import '../domain/models.dart';
import 'customers.dart' show requiredText;

class BillList extends StatelessWidget {
  const BillList({super.key, required this.repository, this.refreshKey = 0});
  final GarageRepository repository;
  final int refreshKey;
  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: BoxConstraints(maxWidth: Space.contentWidth),
      child: ListLoadView<List<Bill>>(
        storageKey: 'staff-bill-list',
        filterKey: repository,
        loadKey: (repository, refreshKey),
        load: repository.bills,
        header: (bills, reload, loading) => [
          Row(
            children: [
              Expanded(
                child: Text(
                  context.l10n.invoices,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              IconButton(
                tooltip: context.l10n.refresh,
                onPressed: loading ? null : reload,
                icon: Icon(Icons.refresh),
              ),
            ],
          ),
          SizedBox(height: 16),
        ],
        items: (bills, reload) => [
          if (bills.isEmpty)
            EmptyNotice(
              context.l10n.noInvoices,
              context.l10n.createInvoiceHint,
              icon: Icons.receipt_long_outlined,
            ),
          for (final bill in bills)
            Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Card(
                child: InkWell(
                  borderRadius: BorderRadius.circular(Radii.card),
                  onTap: () async {
                    await openPage(
                      context,
                      BillScreen(repository: repository, bill: bill),
                    );
                    if (context.mounted) reload();
                  },
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(
                          spacing: 12,
                          runSpacing: 8,
                          children: [
                            Text(
                              bill.code,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            StatusBadge(
                              context.message(billStatusLabel(bill.status)),
                              tone: bill.status == 'paid'
                                  ? 'success'
                                  : 'warning',
                            ),
                          ],
                        ),
                        SizedBox(height: 12),
                        Text(bill.customerName),
                        if (bill.vehicleLabel.isNotEmpty)
                          Text(bill.vehicleLabel),
                        Pair(
                          context.l10n.total,
                          context.money(bill.total, bill.currency),
                          emphasis: true,
                        ),
                        Pair(
                          context.l10n.balance,
                          context.money(bill.balance, bill.currency),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    ),
  );
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

  @override
  Widget build(BuildContext context) => PageFrame(
    title: bill.code,
    demo: widget.repository.isDemo,
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
    body: ListView(
      padding: EdgeInsets.all(Space.page),
      children: [
        if (busy) LinearProgressIndicator(),
        if (busy) SizedBox(height: 16),
        if (error != null) ErrorNotice(error!, retry: reload),
        BillContent(bill: bill),
        SizedBox(height: 24),
        Text(
          context.l10n.paymentHistory,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        SizedBox(height: 12),
        if (bill.receipts.isEmpty) Text(context.l10n.noPayments),
        for (final receipt in bill.receipts)
          Padding(
            padding: EdgeInsets.only(bottom: 12),
            child: Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Pair(
                    receipt.kind == 'refund'
                        ? context.l10n.refund
                        : context.message(paymentLabel(receipt.method)),
                    context.money(receipt.amount, bill.currency),
                  ),
                  if (receipt.date != null)
                    Text(
                      '${context.date(receipt.date!.toLocal())} · ${TimeOfDay.fromDateTime(receipt.date!.toLocal()).format(context)}',
                    ),
                ],
              ),
            ),
          ),
      ],
    ),
    footer: SaveButton(
      label: context.l10n.recordOrCheckPayment,
      busy: busy,
      onPressed: error != null
          ? null
          : () async {
              await openPage(
                context,
                PaymentForm(repository: widget.repository, bill: bill),
              );
              if (mounted) await reload();
            },
    ),
  );
}

class BillContent extends StatelessWidget {
  const BillContent({super.key, required this.bill});
  final Bill bill;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              context.l10n.invoice,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            SizedBox(height: 8),
            SelectableText(bill.code),
            SizedBox(height: 12),
            StatusBadge(
              context.message(billStatusLabel(bill.status)),
              tone: bill.status == 'paid' ? 'success' : 'warning',
            ),
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
      SizedBox(height: 24),
      Text(
        context.l10n.servicesAndParts,
        style: Theme.of(context).textTheme.titleMedium,
      ),
      SizedBox(height: 12),
      Panel(
        child: Column(
          children: [
            for (final line in bill.lines)
              Padding(
                padding: EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Pair(
                      line.description,
                      context.money(line.total, bill.currency),
                    ),
                    Text(
                      '${line.quantity.toString().replaceFirst(RegExp(r'\.0$'), '')} × ${context.money(line.price, bill.currency)}',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
            Divider(),
            Pair(
              context.l10n.subtotal,
              context.money(bill.subtotal, bill.currency),
            ),
            if (bill.discount.cents != 0)
              Pair(
                context.l10n.discount,
                context.money(bill.discount, bill.currency),
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

  int get subtotal => lines.fold<int>(
    0,
    (sum, fields) => sum + (fields.value?.total.cents ?? 0),
  );
  int get total => subtotal + (subtotal * taxRate / 100).round();
  Future<void> save() async {
    if (!validateForm(form)) return;
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
      );
      if (!mounted) {
        return;
      }
      Navigator.pop(context, bill);
    } catch (e) {
      if (mounted) setState(() => error = failureText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PageFrame(
    title: context.l10n.createInvoice,
    demo: widget.repository.isDemo,
    hasChanges: dirty,
    isSaving: busy,
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
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Plate(widget.work.plate),
                SizedBox(height: 12),
                Text(widget.work.customerName),
                Text(widget.work.car),
              ],
            ),
          ),
          SizedBox(height: 24),
          if (error != null) ErrorNotice(error!),
          for (final line in lines)
            Padding(
              key: ObjectKey(line),
              padding: EdgeInsets.only(bottom: 16),
              child: Panel(
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            context.l10n.invoiceLine(lines.indexOf(line) + 1),
                            style: Theme.of(context).textTheme.titleMedium,
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
                    SizedBox(height: 12),
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
                    SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: line.kind,
                      isExpanded: true,
                      decoration: InputDecoration(
                        labelText: context.l10n.lineType,
                      ),
                      items: [
                        DropdownMenuItem(
                          value: 'labor',
                          child: Text(context.l10n.labor),
                        ),
                        DropdownMenuItem(
                          value: 'part',
                          child: Text(context.l10n.part),
                        ),
                        DropdownMenuItem(
                          value: 'fee',
                          child: Text(context.l10n.fee),
                        ),
                      ],
                      onChanged: busy
                          ? null
                          : (v) => setState(() => line.kind = v!),
                    ),
                    SizedBox(height: 16),
                    TextFormField(
                      controller: line.quantity,
                      enabled: !busy,
                      keyboardType: TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: InputDecoration(
                        labelText: context.l10n.quantity,
                      ),
                      onChanged: (_) => setState(() {}),
                      validator: (v) {
                        return LineFields.parseQuantity(v ?? '') != null
                            ? null
                            : context.l10n.quantityError;
                      },
                    ),
                    SizedBox(height: 16),
                    TextFormField(
                      controller: line.price,
                      enabled: !busy,
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
                    Pair(
                      context.l10n.lineTotal,
                      line.value == null
                          ? '—'
                          : context.money(line.value!.total),
                    ),
                  ],
                ),
              ),
            ),
          OutlinedButton.icon(
            onPressed: busy
                ? null
                : () => setState(() {
                    lines.add(LineFields(text: ''));
                    dirty = true;
                  }),
            icon: Icon(Icons.add),
            label: Text(context.l10n.addLine),
          ),
          SizedBox(height: 24),
          DropdownButtonFormField<double>(
            initialValue: taxRate,
            decoration: InputDecoration(labelText: context.l10n.vat),
            items: [
              DropdownMenuItem(value: 0, child: Text('0%')),
              DropdownMenuItem(value: 12, child: Text('12%')),
            ],
            onChanged: busy ? null : (v) => setState(() => taxRate = v!),
          ),
          SizedBox(height: 16),
          Panel(
            child: Column(
              children: [
                Pair(context.l10n.subtotal, context.money(Money(subtotal))),
                Pair(context.l10n.vat, context.money(Money(total - subtotal))),
                Pair(
                  context.l10n.total,
                  context.money(Money(total)),
                  emphasis: true,
                ),
              ],
            ),
          ),
        ],
      ),
    ),
    footer: Row(
      children: [
        TextButton(
          onPressed: busy ? null : () => Navigator.maybePop(context),
          child: Text(context.l10n.back),
        ),
        SizedBox(width: 8),
        Expanded(
          child: SaveButton(
            label: context.l10n.createInvoice,
            onPressed: save,
            busy: busy,
          ),
        ),
      ],
    ),
  );
}

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
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(context.l10n.paymentRecorded)));
        Navigator.pop(context, result);
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

  @override
  Widget build(BuildContext context) => PageFrame(
    title: context.l10n.recordPayment,
    demo: widget.repository.isDemo,
    hasChanges: dirty && pending == null,
    isSaving: busy,
    body: Form(
      key: form,
      autovalidateMode: AutovalidateMode.onUserInteraction,
      onChanged: () {
        if (ready && !busy) setState(() => dirty = true);
      },
      child: ListView(
        padding: EdgeInsets.all(Space.page),
        children: [
          if (busy) LinearProgressIndicator(),
          if (busy) SizedBox(height: 16),
          if (error != null) ErrorNotice(error!, retry: !ready ? reload : null),
          Text(bill.code, style: Theme.of(context).textTheme.titleMedium),
          Pair(
            context.l10n.remainingAmount,
            context.money(bill.balance, bill.currency),
            emphasis: true,
          ),
          SizedBox(height: 16),
          if (pending != null)
            Panel(child: Text(context.l10n.pendingPaymentHint)),
          SizedBox(height: 16),
          TextFormField(
            controller: amount,
            enabled: !busy && pending == null && bill.canPay,
            keyboardType: TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: context.l10n.receivedAmount,
              suffixText: bill.currency == 'UZS'
                  ? context.l10n.uzs
                  : bill.currency,
            ),
            validator: (v) {
              final money = Money.parse(v ?? '');
              return money != null &&
                      money.cents > 0 &&
                      money.cents <= bill.balance.cents
                  ? null
                  : context.l10n.paymentAmountError;
            },
          ),
          SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: method,
            key: ValueKey(method),
            isExpanded: true,
            decoration: InputDecoration(labelText: context.l10n.paymentMethod),
            items: ['cash', 'card', 'bank_transfer']
                .map(
                  (s) => DropdownMenuItem(
                    value: s,
                    child: Text(context.message(paymentLabel(s))),
                  ),
                )
                .toList(),
            onChanged: busy || pending != null || !bill.canPay
                ? null
                : (v) => setState(() => method = v!),
          ),
          SizedBox(height: 24),
          Text(context.l10n.manualPaymentHint),
          if (!bill.canPay && pending == null) ...[
            SizedBox(height: 16),
            StatusBadge(context.l10n.cannotPayInvoice, tone: 'success'),
          ],
        ],
      ),
    ),
    footer: SaveButton(
      label: pending == null
          ? context.l10n.recordPayment
          : context.l10n.checkResult,
      busy: busy,
      onPressed: ready && (bill.canPay || pending != null) ? pay : null,
    ),
  );
}
