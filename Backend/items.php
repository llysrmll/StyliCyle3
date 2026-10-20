<?php
// GET  items.php           -> all available listings
// GET  items.php?mine=1    -> only the logged-in user's listings
// POST items.php           -> create a listing (multipart form with optional photo)
require 'config.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!empty($_GET['mine'])) {
        $user = require_login();
        $stmt = $pdo->prepare('select * from items where owner_id = ? order by id desc');
        $stmt->execute([$user['id']]);
    } else {
        $stmt = $pdo->query("select * from items where status = 'available' order by id desc");
    }
    out(['ok' => true, 'items' => $stmt->fetchAll()]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);

$user = require_login();

$title    = trim($_POST['title'] ?? '');
$category = trim($_POST['category'] ?? '');
$price    = num($_POST['price_per_day'] ?? '');
$size     = trim($_POST['size'] ?? '');
$desc     = trim($_POST['description'] ?? '');

if ($title === '' || $price === null || $price <= 0) fail('Item name and a valid price are required.');

// ---- optional photo upload ----
$imagePath = null;
if (!empty($_FILES['image']['name']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
    if ($_FILES['image']['size'] > 3 * 1024 * 1024) fail('Photo must be 3 MB or smaller.');

    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($_FILES['image']['tmp_name']);
    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($allowed[$mime])) fail('Photo must be a JPG, PNG or WEBP image.');

    $name = bin2hex(random_bytes(8)) . '.' . $allowed[$mime];
    if (!move_uploaded_file($_FILES['image']['tmp_name'], __DIR__ . '/uploads/' . $name)) {
        fail('Could not save the photo. Check that Backend/uploads exists and is writable.', 500);
    }
    $imagePath = 'Backend/uploads/' . $name;
}

// Listings go live immediately for the demo. Change to 'pending' if you add an admin approval page.
$stmt = $pdo->prepare(
    'insert into items (owner_id, title, category, price_per_day, size, chest_cm, waist_cm, length_cm, description, image_path)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id'
);
$stmt->execute([
    $user['id'], $title, $category ?: null, $price, $size ?: null,
    num($_POST['chest_cm'] ?? ''), num($_POST['waist_cm'] ?? ''), num($_POST['length_cm'] ?? ''),
    $desc ?: null, $imagePath,
]);

out(['ok' => true, 'id' => $stmt->fetchColumn()]);
