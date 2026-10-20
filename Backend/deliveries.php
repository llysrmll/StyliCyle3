<?php
// GET  deliveries.php                                  -> your deliveries (admin sees everyone's)
// POST deliveries.php  {pickupAddress, ...}            -> schedule a delivery (fee is computed here)
// POST deliveries.php  {action:"update_status", ...}   -> admin only
require 'config.php';

$user = require_login();
$isAdmin = ($user['role'] === 'admin');

// Straight-line distance between two coordinates, in km.
function haversine(float $lat1, float $lng1, float $lat2, float $lng2): float {
    $r = 6371;
    $dLat = deg2rad($lat2 - $lat1);
    $dLng = deg2rad($lng2 - $lng1);
    $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;
    return $r * 2 * atan2(sqrt($a), sqrt(1 - $a));
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($isAdmin) {
        $stmt = $pdo->query(
            'select d.*, u.first_name || \' \' || u.last_name as customer
             from deliveries d left join users u on u.id = d.user_id order by d.id desc'
        );
    } else {
        $stmt = $pdo->prepare('select * from deliveries where user_id = ? order by id desc');
        $stmt->execute([$user['id']]);
    }
    out(['ok' => true, 'isAdmin' => $isAdmin, 'deliveries' => $stmt->fetchAll()]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);

$d = body();

// ---- admin changes delivery status ----
if (($d['action'] ?? '') === 'update_status') {
    if (!$isAdmin) fail('Admins only.', 403);
    $allowed = ['Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Returned'];
    if (!in_array($d['status'] ?? '', $allowed, true)) fail('Invalid status.');
    $stmt = $pdo->prepare('update deliveries set status = ? where id = ?');
    $stmt->execute([$d['status'], (int)$d['id']]);
    out(['ok' => true]);
}

// ---- customer schedules a delivery ----
$pickup   = trim($d['pickupAddress'] ?? '');
$delivery = trim($d['deliveryAddress'] ?? '');
$pc = $d['pickupCoords'] ?? null;
$dc = $d['deliveryCoords'] ?? null;

if ($pickup === '' || $delivery === '') fail('Pickup and delivery addresses are required.');
if (!is_array($pc) || !is_array($dc))   fail('Click Search on both addresses first so the map can find them.');

$km  = haversine((float)$pc[0], (float)$pc[1], (float)$dc[0], (float)$dc[1]);
$km  = round($km, 2);
$fee = round(50 + 12 * $km, 2);          // base fee 50 + 12 per km (change to whatever you present)

$time = !empty($d['pickupTime']) ? str_replace('T', ' ', $d['pickupTime']) : null;

$stmt = $pdo->prepare(
    'insert into deliveries
       (user_id, pickup_address, delivery_address, pickup_lat, pickup_lng, delivery_lat, delivery_lng,
        distance_km, fee, pickup_time, item_type, notes)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id'
);
$stmt->execute([
    $user['id'], $pickup, $delivery, $pc[0], $pc[1], $dc[0], $dc[1],
    $km, $fee, $time, trim($d['itemType'] ?? '') ?: null, trim($d['notes'] ?? '') ?: null,
]);

out(['ok' => true, 'id' => $stmt->fetchColumn(), 'distance_km' => $km, 'fee' => $fee]);
