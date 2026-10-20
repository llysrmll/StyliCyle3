<?php
// Tells the frontend who is logged in (user is null when nobody is).
require 'config.php';
out(['ok' => true, 'user' => $_SESSION['user'] ?? null]);
