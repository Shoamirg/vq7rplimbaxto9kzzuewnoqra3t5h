import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../data/api_client.dart';
import '../data/payment_store.dart';
import '../data/repository.dart';
import '../design/theme.dart';
import '../design/widgets.dart';
import '../domain/models.dart';
import 'customers.dart' show requiredText;

class BillList extends StatelessWidget {
  const BillList({super.key, required this.repository});
  final GarageRepository repository;
  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: Space.contentWidth),
      child: LoadView<List<Bill>>(
        load: repository.bills,
        builder: (bills, reload) => ListView(
          padding: const EdgeInsets.all(Space.page),
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Hisoblar',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                IconButton(
                  tooltip: 'Yangilash',
                  onPressed: reload,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (bills.isEmpty)
              const EmptyNotice(
                'Hisoblar yoʻq',
                'Servis ishi tugagach uning ichidan hisob yarating.',
                icon: Icons.receipt_long_outlined,
              ),
            for (final bill in bills)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Card(
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () async {
                      await openPage(
                        context,
                        BillScreen(repository: repository, bill: bill),
                      );
                      if (context.mounted) reload();
                    },
                    child: Padding(
                      padding: const EdgeInsets.all(16),
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
                                billStatusLabel(bill.status),
                                tone: bill.status == 'paid'
                                    ? 'success'
                                    : 'warning',
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Text(bill.customerName),
                          if (bill.vehicleLabel.isNotEmpty)
                            Text(bill.vehicleLabel),
                          Pair(
                            'Jami',
                            bill.total.format(bill.currency),
                            emphasis: true,
                          ),
                          Pair('Qoldiq', bill.balance.format(bill.currency)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
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
        tooltip: 'Yangilash',
        onPressed: busy ? null : reload,
        icon: const Icon(Icons.refresh),
      ),
      IconButton(
        tooltip: 'Mijozga koʻrsatish',
        onPressed: busy || error != null
            ? null
            : () => openPage(
                context,
                CustomerBillView(bill: bill, demo: widget.repository.isDemo),
              ),
        icon: const Icon(Icons.visibility_outlined),
      ),
    ],
    body: ListView(
      padding: const EdgeInsets.all(Space.page),
      children: [
        if (busy) const LinearProgressIndicator(),
        if (busy) const SizedBox(height: 16),
        if (error != null) ErrorNotice(error!, retry: reload),
        BillContent(bill: bill),
        const SizedBox(height: 24),
        Text(
          'Toʻlovlar tarixi',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 12),
        if (bill.receipts.isEmpty) const Text('Toʻlov hali yozilmagan.'),
        for (final receipt in bill.receipts)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Pair(
                    receipt.kind == 'refund'
                        ? 'Qaytarish'
                        : paymentLabel(receipt.method),
                    receipt.amount.format(bill.currency),
                  ),
                  if (receipt.date != null)
                    Text(
                      '${dateLabel(receipt.date!.toLocal())} · ${TimeOfDay.fromDateTime(receipt.date!.toLocal()).format(context)}',
                    ),
                ],
              ),
            ),
          ),
      ],
    ),
    footer: SaveButton(
      label: 'Toʻlov yozish / tekshirish',
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
              'Hisob-faktura',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            SelectableText(bill.code),
            const SizedBox(height: 12),
            StatusBadge(
              billStatusLabel(bill.status),
              tone: bill.status == 'paid' ? 'success' : 'warning',
            ),
            const Divider(),
            Text(
              bill.customerName,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (bill.vehicleLabel.isNotEmpty) Text(bill.vehicleLabel),
            if (bill.dueDate != null)
              Pair('Toʻlov muddati', dateLabel(bill.dueDate!)),
          ],
        ),
      ),
      const SizedBox(height: 24),
      Text(
        'Xizmatlar va qismlar',
        style: Theme.of(context).textTheme.titleMedium,
      ),
      const SizedBox(height: 12),
      Panel(
        child: Column(
          children: [
            for (final line in bill.lines)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Pair(line.description, line.total.format(bill.currency)),
                    Text(
                      '${line.quantity.toString().replaceFirst(RegExp(r'\.0$'), '')} × ${line.price.format(bill.currency)}',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
            const Divider(),
            Pair('Xizmatlar jami', bill.subtotal.format(bill.currency)),
            if (bill.discount.cents != 0)
              Pair('Chegirma', bill.discount.format(bill.currency)),
            Pair('QQS', bill.tax.format(bill.currency)),
            Pair('Jami', bill.total.format(bill.currency), emphasis: true),
            Pair('Toʻlangan', bill.paid.format(bill.currency)),
            Pair('Qoldiq', bill.balance.format(bill.currency), emphasis: true),
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
    title: 'Mijoz uchun hisob',
    demo: demo,
    body: ListView(
      padding: const EdgeInsets.all(Space.page),
      children: [BillContent(bill: bill)],
    ),
  );
}

class LineFields {
  LineFields({String text = 'Servis ishi'})
    : description = TextEditingController(text: text);
  final TextEditingController description;
  final quantity = TextEditingController(text: '1'),
      price = TextEditingController();
  String kind = 'labor';
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
  final form = GlobalKey<FormState>(), lines = <LineFields>[LineFields()];
  double taxRate = 0;
  bool busy = false, dirty = false;
  String? error;
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
      setState(
        () => error =
            'Jami summa 0 dan katta va 100 million soʻmdan kam boʻlsin.',
      );
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
    title: 'Hisob yaratish',
    demo: widget.repository.isDemo,
    hasChanges: dirty,
    isSaving: busy,
    body: Form(
      key: form,
      onChanged: () => setState(() => dirty = true),
      child: ListView(
        padding: const EdgeInsets.all(Space.page),
        children: [
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Plate(widget.work.plate),
                const SizedBox(height: 12),
                Text(widget.work.customerName),
                Text(widget.work.car),
              ],
            ),
          ),
          const SizedBox(height: 24),
          if (error != null) ErrorNotice(error!),
          for (final line in lines)
            Padding(
              key: ObjectKey(line),
              padding: const EdgeInsets.only(bottom: 16),
              child: Panel(
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Hisob qatori ${lines.indexOf(line) + 1}',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                        IconButton(
                          tooltip: 'Qatorni oʻchirish',
                          onPressed: busy || lines.length == 1
                              ? null
                              : () {
                                  setState(() {
                                    lines.remove(line);
                                    dirty = true;
                                  });
                                  line.dispose();
                                },
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: line.description,
                      enabled: !busy,
                      maxLength: 255,
                      validator: requiredText,
                      decoration: const InputDecoration(
                        labelText: 'Xizmat yoki qism nomi',
                      ),
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: line.kind,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Qator turi',
                      ),
                      items: const [
                        DropdownMenuItem(
                          value: 'labor',
                          child: Text('Xizmat / ish haqi'),
                        ),
                        DropdownMenuItem(
                          value: 'part',
                          child: Text('Ehtiyot qism'),
                        ),
                        DropdownMenuItem(
                          value: 'fee',
                          child: Text('Qoʻshimcha haq'),
                        ),
                      ],
                      onChanged: busy
                          ? null
                          : (v) => setState(() => line.kind = v!),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: line.quantity,
                      enabled: !busy,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: const InputDecoration(labelText: 'Miqdor'),
                      onChanged: (_) => setState(() {}),
                      validator: (v) {
                        return LineFields.parseQuantity(v ?? '') != null
                            ? null
                            : 'Musbat miqdorni kiriting.';
                      },
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: line.price,
                      enabled: !busy,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Birlik narxi',
                        suffixText: 'soʻm',
                      ),
                      onChanged: (_) => setState(() {}),
                      validator: (v) {
                        final price = Money.parse(v ?? '');
                        if (price == null) return 'Toʻgʻri narxni kiriting.';
                        final quantity = LineFields.parseQuantity(
                          line.quantity.text,
                        );
                        if (quantity != null &&
                            quantity * price.cents > Money.maxCents) {
                          return 'Qator summasi 100 million soʻmdan kam boʻlsin.';
                        }
                        return null;
                      },
                    ),
                    Pair('Qator jami', line.value?.total.format() ?? '—'),
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
            icon: const Icon(Icons.add),
            label: const Text('Qator qoʻshish'),
          ),
          const SizedBox(height: 24),
          DropdownButtonFormField<double>(
            initialValue: taxRate,
            decoration: const InputDecoration(labelText: 'QQS'),
            items: const [
              DropdownMenuItem(value: 0, child: Text('0%')),
              DropdownMenuItem(value: 12, child: Text('12%')),
            ],
            onChanged: busy ? null : (v) => setState(() => taxRate = v!),
          ),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              children: [
                Pair('Xizmatlar jami', Money(subtotal).format()),
                Pair('QQS', Money(total - subtotal).format()),
                Pair('Jami', Money(total).format(), emphasis: true),
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
          child: const Text('Ortga'),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: SaveButton(
            label: 'Hisob yaratish',
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
        PendingPayment(Money.parse(amount.text)!, method, const Uuid().v4());
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
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Toʻlov qayd etildi.')));
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
    title: 'Toʻlovni qayd etish',
    demo: widget.repository.isDemo,
    hasChanges: dirty && pending == null,
    isSaving: busy,
    body: Form(
      key: form,
      onChanged: () {
        if (ready && !busy) setState(() => dirty = true);
      },
      child: ListView(
        padding: const EdgeInsets.all(Space.page),
        children: [
          if (busy) const LinearProgressIndicator(),
          if (busy) const SizedBox(height: 16),
          if (error != null) ErrorNotice(error!, retry: !ready ? reload : null),
          Text(bill.code, style: Theme.of(context).textTheme.titleMedium),
          Pair(
            'Qolgan summa',
            bill.balance.format(bill.currency),
            emphasis: true,
          ),
          const SizedBox(height: 16),
          if (pending != null)
            Panel(
              child: Text(
                'Oldingi toʻlov soʻrovi saqlangan. Natijani tekshirish shu soʻrovni takrorlaydi; yangi toʻlov yaratmaydi.',
              ),
            ),
          const SizedBox(height: 16),
          TextFormField(
            controller: amount,
            enabled: !busy && pending == null && bill.canPay,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: 'Qabul qilingan summa',
              suffixText: bill.currency == 'UZS' ? 'soʻm' : bill.currency,
            ),
            validator: (v) {
              final money = Money.parse(v ?? '');
              return money != null &&
                      money.cents > 0 &&
                      money.cents <= bill.balance.cents
                  ? null
                  : 'Musbat summa kiriting; qoldiqdan oshmasin.';
            },
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: method,
            key: ValueKey(method),
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Toʻlov usuli'),
            items: ['cash', 'card', 'bank_transfer']
                .map(
                  (s) =>
                      DropdownMenuItem(value: s, child: Text(paymentLabel(s))),
                )
                .toList(),
            onChanged: busy || pending != null || !bill.canPay
                ? null
                : (v) => setState(() => method = v!),
          ),
          const SizedBox(height: 24),
          const Text('Mijozdan qabul qilingan toʻlovni hisobga yozing.'),
          if (!bill.canPay && pending == null) ...[
            const SizedBox(height: 16),
            const StatusBadge(
              'Bu hisob toʻlov qabul qilmaydi',
              tone: 'success',
            ),
          ],
        ],
      ),
    ),
    footer: SaveButton(
      label: pending == null ? 'Toʻlovni qayd etish' : 'Natijani tekshirish',
      busy: busy,
      onPressed: ready && (bill.canPay || pending != null) ? pay : null,
    ),
  );
}
