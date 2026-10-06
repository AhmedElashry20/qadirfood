// شاشة ١١: البحث — GET /customer/branches?q=
// السيرفر بيبحث في أسماء المطاعم والمطبخ وأسماء الأصناف وبيرجّع فروع بس،
// فمفيش نتائج على مستوى الصنف (SearchResults.items دايماً فاضية).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../providers/restaurants_provider.dart';
import '../../widgets/common.dart';
import '../../widgets/restaurant_card.dart';

/// اقتراحات جاهزة تظهر قبل ما المستخدم يكتب.
const _popularSearches = <String>['وجبة', 'مندي', 'قهوة مختصة', 'بيتزا'];

/// كل حرف بيبعت طلب للسيرفر — بنستنى شوية قبل ما نبحث.
const _kDebounce = Duration(milliseconds: 350);

/// البحث والفلترة — جوّه الشل السفلي: من غير زر رجوع.
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _controller = TextEditingController();

  Timer? _debounce;
  String _query = '';

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  /// الكتابة — بنأجّل الطلب لحد ما المستخدم يقف.
  void _onTyped(String value) {
    _debounce?.cancel();
    _debounce = Timer(_kDebounce, () {
      if (!mounted) return;
      setState(() => _query = value);
    });
  }

  /// الضغط على اقتراح — بحث فوري.
  void _setQuery(String value) {
    _debounce?.cancel();
    if (_controller.text != value) {
      _controller.text = value;
      _controller.selection = TextSelection.collapsed(offset: value.length);
    }
    setState(() => _query = value);
  }

  @override
  Widget build(BuildContext context) {
    final filters = ref.watch(filtersProvider);
    final query = _query.trim();

    return Scaffold(
      backgroundColor: QColors.surface,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(QSpace.screenH, 18, QSpace.screenH, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _controller,
                          autofocus: false,
                          textInputAction: TextInputAction.search,
                          onChanged: _onTyped,
                          onSubmitted: _setQuery,
                          style: TextStyle(
                            fontFamily: 'Cairo',
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: QColors.ink,
                          ),
                          decoration: InputDecoration(
                            hintText: 'ابحث عن مطعم أو طبق…',
                            prefixIcon: Icon(Icons.search, size: 20, color: QColors.hint),
                            contentPadding:
                                const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(QRadius.md),
                              borderSide: BorderSide(color: QColors.brand, width: 2),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(QRadius.md),
                              borderSide: BorderSide(color: QColors.brand, width: 2),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      InkWell(
                        onTap: () => context.push(QRoutes.filters),
                        borderRadius: BorderRadius.circular(QRadius.md),
                        child: Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(QRadius.md),
                            border: Border.all(color: QColors.border, width: 1.5),
                          ),
                          child: Icon(Icons.tune_rounded, size: 20, color: QColors.ink),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (filters.freeDeliveryOnly)
                        QChip(
                          label: 'توصيل مجاني ✓',
                          selected: true,
                          onTap: () => ref.read(filtersProvider.notifier).toggleFreeDelivery(),
                        ),
                      if (filters.under30Minutes)
                        QChip(
                          label: 'أقل من 30 دقيقة ✓',
                          selected: true,
                          onTap: () => ref.read(filtersProvider.notifier).toggleUnder30(),
                        ),
                      if (filters.openNowOnly)
                        QChip(
                          label: 'مفتوح الآن ✓',
                          selected: true,
                          onTap: () => ref.read(filtersProvider.notifier).toggleOpenNow(),
                        ),
                      QChip(
                        label: '4★ فأعلى',
                        selected: filters.minRating == 4.0,
                        onTap: () => ref.read(filtersProvider.notifier).toggleMinRating(4.0),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                ],
              ),
            ),
            Expanded(
              child: query.isEmpty ? _buildPopular() : _buildResults(query),
            ),
          ],
        ),
      ),
    );
  }

  /// «عمليات بحث شائعة» — يظهر قبل ما المستخدم يكتب.
  Widget _buildPopular() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(QSpace.screenH, 0, QSpace.screenH, 24),
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: QColors.tint,
            borderRadius: BorderRadius.circular(QRadius.lg),
            border: Border.all(color: QColors.tintBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'عمليات بحث شائعة',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 13.5,
                  fontWeight: FontWeight.w800,
                  color: QColors.ink,
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final term in _popularSearches)
                    InkWell(
                      onTap: () => _setQuery(term),
                      borderRadius: BorderRadius.circular(QRadius.pill),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                        decoration: BoxDecoration(
                          color: QColors.surface,
                          borderRadius: BorderRadius.circular(QRadius.pill),
                          border: Border.all(color: QColors.tintBorder),
                        ),
                        child: Text(
                          term,
                          style: TextStyle(
                            fontFamily: 'Cairo',
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: QColors.label,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildResults(String query) {
    final results = ref.watch(searchProvider(query));

    return results.when(
      loading: () => Center(child: CircularProgressIndicator(color: QColors.brand)),
      error: (error, _) => _ErrorView(
        error: error,
        onRetry: () => ref.invalidate(searchProvider(query)),
      ),
      data: (data) {
        final restaurants = data.restaurants;

        if (restaurants.isEmpty) {
          return const Padding(
            padding: EdgeInsets.fromLTRB(QSpace.screenH, 0, QSpace.screenH, 24),
            child: QEmpty(message: 'ما لقينا نتائج — جرّب كلمة تانية', emoji: '🔍'),
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: QSpace.screenH),
              child: Text.rich(
                TextSpan(
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: QColors.textMuted,
                  ),
                  children: [
                    const TextSpan(text: 'نتائج البحث · '),
                    TextSpan(
                      text: '${restaurants.length}',
                      style: QText.num(size: 13.5, weight: FontWeight.w700),
                    ),
                    const TextSpan(text: ' مطعم'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(QSpace.screenH, 0, QSpace.screenH, 24),
                itemCount: restaurants.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, i) {
                  final r = restaurants[i];
                  return RestaurantRow(
                    restaurant: r,
                    onTap: () => context.push(QRoutes.restaurant(r.id)),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}

/// خطأ من السيرفر + زر إعادة المحاولة.
class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final err = error;
    final message = err is ApiException ? err.message : 'حدث خطأ';

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: QSpace.screenH, vertical: 24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('😕', style: TextStyle(fontSize: 34)),
          const SizedBox(height: 10),
          Text(message, textAlign: TextAlign.center, style: QText.bodyMuted),
          const SizedBox(height: 16),
          SizedBox(
            width: 200,
            child: QButton(label: 'إعادة المحاولة', onPressed: onRetry),
          ),
        ],
      ),
    );
  }
}
