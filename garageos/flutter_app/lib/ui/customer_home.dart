import 'package:flutter/material.dart';

import '../app_state.dart';
import '../data/customer_repository.dart';
import '../data/api_client.dart';
import '../domain/models.dart';
import '../design/theme.dart';
import '../design/vehicle_stage.dart';
import '../design/widgets.dart';
import '../l10n/l10n.dart';
import 'customer_booking.dart';
import 'settings.dart';

class CustomerHome extends StatefulWidget {
  const CustomerHome({super.key, required this.state, required this.onLogout});
  final AppState state;
  final VoidCallback onLogout;
  @override
  State<CustomerHome> createState() => _CustomerHomeState();
}

class _CustomerHomeState extends State<CustomerHome> {
  int tab = 0;
  final visited = <int>{0};
  @override
  Widget build(BuildContext context) {
    final repo = widget.state.customerRepository!;
    final kinds = ['vehicles', 'appointments', 'invoices'];
    return Scaffold(
      appBar: AppBar(
        title: Text('${widget.state.name} · ${widget.state.garageName}'),
        actions: [
          const LanguageMenu(),
          IconButton(
            tooltip: context.l10n.signOut,
            onPressed: widget.onLogout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: IndexedStack(
        index: tab,
        children: [
          for (var i = 0; i < 3; i++)
            visited.contains(i)
                ? CustomerHistory(repository: repo, kind: kinds[i])
                : const SizedBox.shrink(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (i) => setState(() {
          tab = i;
          visited.add(i);
        }),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.directions_car_outlined),
            label: context.l10n.myVehicles,
          ),
          NavigationDestination(
            icon: const Icon(Icons.event_outlined),
            label: context.l10n.myAppointments,
          ),
          NavigationDestination(
            icon: const Icon(Icons.receipt_long_outlined),
            label: context.l10n.myInvoices,
          ),
        ],
      ),
    );
  }
}

class CustomerHistory extends StatefulWidget {
  const CustomerHistory({
    super.key,
    required this.repository,
    required this.kind,
  });
  final CustomerRepository repository;
  final String kind;
  @override
  State<CustomerHistory> createState() => _CustomerHistoryState();
}

class _CustomerHistoryState extends State<CustomerHistory> {
  int page = 1;
  String query = '';
  late Future<PageData<Json>> future = widget.repository.history(widget.kind);
  void load() => setState(
    () => future = widget.repository.history(
      widget.kind,
      page: page,
      query: query,
    ),
  );
  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.all(Space.page),
    child: Column(
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                context.l10n.customerPortal,
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
            IconButton(
              tooltip: context.l10n.refresh,
              onPressed: load,
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (widget.kind == 'appointments') ...[
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () async {
                final submitted = await openPage<bool>(
                  context,
                  CustomerBookingScreen(repository: widget.repository),
                );
                if (submitted == true && mounted && context.mounted) {
                  load();
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(context.l10n.bookingWaitingConfirmation)),
                  );
                }
              },
              icon: const Icon(Icons.add),
              label: Text(context.l10n.bookService),
            ),
          ),
          const SizedBox(height: 12),
        ],
        TextField(
          decoration: InputDecoration(
            labelText: context.l10n.customerSearch,
            prefixIcon: const Icon(Icons.search),
          ),
          onSubmitted: (value) {
            query = value.trim();
            page = 1;
            load();
          },
        ),
        const SizedBox(height: 16),
        Expanded(
          child: FutureBuilder<PageData<Json>>(
            future: future,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.hasError) {
                return ErrorNotice(failureText(snapshot.error!), retry: load);
              }
              final data = snapshot.data!;
              return Column(
                children: [
                  Expanded(
                    child: data.items.isEmpty
                        ? Center(child: Text(context.l10n.emptyHistory))
                        : ListView.separated(
                            itemCount: data.items.length,
                            separatorBuilder: (_, index) =>
                                const SizedBox(height: 18),
                            itemBuilder: (context, index) {
                              final item = data.items[index];
                              final invoice = widget.kind == 'invoices';
                              if (widget.kind == 'vehicles') {
                                return Panel(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      const VehicleStage(),
                                      const SizedBox(height: 18),
                                      Text(
                                        item['title'],
                                        style: Theme.of(context)
                                            .textTheme
                                            .titleMedium,
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        item['detail'] ?? '',
                                        style: TextStyle(
                                          color: context.colors.secondary,
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              }
                              return ListTile(
                                contentPadding: EdgeInsets.zero,
                                title: Text(item['title']),
                                subtitle: Text(
                                  '${customerStatus(context, item['detail'] ?? '')}${invoice ? ' · ${context.money(Money.fromApi(item['total']), item['currency'])}' : ''}',
                                ),
                                trailing: invoice
                                    ? const Icon(Icons.chevron_right)
                                    : null,
                                onTap: invoice
                                    ? () => openPage(
                                        context,
                                        CustomerInvoice(
                                          repository: widget.repository,
                                          id: item['id'],
                                        ),
                                      )
                                    : null,
                              );
                            },
                          ),
                  ),
                  Wrap(
                    alignment: WrapAlignment.center,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 16,
                    children: [
                      TextButton(
                        onPressed: page > 1
                            ? () {
                                page--;
                                load();
                              }
                            : null,
                        child: Text(context.l10n.previousPage),
                      ),
                      Text('$page'),
                      TextButton(
                        onPressed: data.hasNext
                            ? () {
                                page++;
                                load();
                              }
                            : null,
                        child: Text(context.l10n.nextPage),
                      ),
                    ],
                  ),
                ],
              );
            },
          ),
        ),
      ],
    ),
  );
}

String customerStatus(BuildContext context, String value) => switch (value) {
  'pending' ||
  'confirmed' ||
  'in_progress' ||
  'completed' ||
  'cancelled' ||
  'rescheduled' => context.message(WorkStatus.parse(value).label),
  'paid' => context.l10n.paid,
  'partial' => context.l10n.customerPartial,
  'issued' => context.l10n.customerIssued,
  'cash' => context.l10n.cash,
  'card' => context.l10n.card,
  'bank_transfer' => context.l10n.bankTransfer,
  'online' => context.l10n.online,
  'overdue' => context.l10n.overdue,
  'void' => context.l10n.cancelled,
  'refunded' => context.l10n.customerRefund,
  'payment' => context.l10n.customerPayment,
  'deposit' => context.l10n.customerDeposit,
  'refund' => context.l10n.customerRefund,
  _ => value,
};

class CustomerInvoice extends StatefulWidget {
  const CustomerInvoice({
    super.key,
    required this.repository,
    required this.id,
  });
  final CustomerRepository repository;
  final String id;
  @override
  State<CustomerInvoice> createState() => _CustomerInvoiceState();
}

class _CustomerInvoiceState extends State<CustomerInvoice> {
  late Future<Json> future = widget.repository.invoice(widget.id);
  void reload() =>
      setState(() => future = widget.repository.invoice(widget.id));
  @override
  Widget build(BuildContext context) => PageFrame(
    title: context.l10n.myInvoices,
    actions: [
      IconButton(
        tooltip: context.l10n.refresh,
        onPressed: reload,
        icon: const Icon(Icons.refresh),
      ),
    ],
    body: FutureBuilder<Json>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return ErrorNotice(failureText(snapshot.error!), retry: reload);
        }
        final invoice = snapshot.data!;
        final currency = invoice['currency'];
        return ListView(
          padding: EdgeInsets.all(Space.page),
          children: [
            Text(
              invoice['code'],
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            Text(
              '${context.l10n.total}: ${context.money(Money.fromApi(invoice['total']), currency)}',
            ),
            Text(
              '${context.l10n.balance}: ${context.money(Money.fromApi(invoice['balance']), currency)}',
            ),
            const SizedBox(height: 24),
            Text(
              context.l10n.invoiceLines,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            for (final line in invoice['lines'])
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(line['description']),
                subtitle: Text('${line['quantity']}'),
                trailing: Text(
                  context.money(Money.fromApi(line['total']), currency),
                ),
              ),
            const SizedBox(height: 24),
            Text(
              context.l10n.paymentHistory,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if ((invoice['payments'] as List).isEmpty)
              Text(context.l10n.emptyHistory),
            for (final payment in invoice['payments'])
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  '${customerStatus(context, payment['kind'])} · ${customerStatus(context, payment['method'])}',
                ),
                subtitle: Text(context.date(DateTime.parse(payment['date']))),
                trailing: Text(
                  context.money(Money.fromApi(payment['amount']), currency),
                ),
              ),
          ],
        );
      },
    ),
  );
}
